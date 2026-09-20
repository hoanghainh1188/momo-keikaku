/**
 * The pg-boss migrator step: the one place that performs DDL on the `pgboss` schema.
 *
 * ARCHITECTURE-SPINE.md: "pg-boss's schema is installed and migrated by the owner role
 * during migrate, and the app role starts it with auto-migration disabled holding only DML
 * grants." pg-boss installs and migrates its own schema on `start()` by default — DDL that
 * the application role must not be able to perform. This script moves that DDL to the role
 * that owns it, and leaves the worker with a role that would be *refused* if it tried.
 *
 * It runs three things, in order, and every one of them is idempotent:
 *
 *   1. Creates (or updates) the two roles. `momo_migrator` owns the schema and cannot log
 *      in — it is assumed with `SET ROLE` from the owning connection, so there is no second
 *      credential to manage and no second key in the config schema. The application role's
 *      name and password come from APP_DATABASE_URL, so the string the worker connects
 *      with *is* the statement of who it is; a name and a password in two keys could
 *      disagree, and this cannot.
 *   2. Installs or migrates the schema by executing the SQL pg-boss itself generates —
 *      `getConstructionPlans` when the schema is absent, `getMigrationPlans` when it is
 *      behind. Never hand-written DDL: a hand-written copy would drift from what the
 *      library expects and the drift would surface as a failure at `start()`.
 *   3. Grants the application role USAGE on the schema and DML on its objects, and nothing
 *      else. No CREATE — which is exactly what makes `CREATE TABLE ... IN pgboss` fail for
 *      it, the property this whole split exists to establish.
 *
 * Why a script and not a module under `packages/`: it is a migration step, run beside
 * `drizzle-kit push` and `pnpm seed`, and `scripts/` is deliberately outside the clock/env
 * fence (see eslint.config.js) because it is tooling rather than application code. It still
 * takes its configuration from `packages/app/src/config.ts` rather than reading the
 * environment itself, so a missing key fails here naming the key, the same way it does in
 * the worker.
 *
 * Run: `pnpm pgboss:migrate` (CI's prepare step does, after `drizzle-kit push`).
 */
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { getConstructionPlans, getMigrationPlans } from 'pg-boss';
import pgBossPackage from 'pg-boss/package.json' with { type: 'json' };
import { config } from '../packages/app/src/config.js';

/**
 * pg-boss's own default schema name. `apps/worker/src/boss.ts` names the same one; a
 * disagreement is not silent — the worker's `check()` fails at boot with "pg-boss is not
 * installed" rather than quietly looking at an empty schema.
 */
const PGBOSS_SCHEMA = 'pgboss';

/**
 * The owner. NOLOGIN on purpose: ownership is what the split is about, not a second login.
 * A superuser (or any member) reaches it with `SET ROLE`, so the DDL below runs *as* this
 * role and every object it creates belongs to it.
 */
const MIGRATOR_ROLE = 'momo_migrator';

/**
 * The schema version this pg-boss release expects, read from the library's own manifest —
 * the same field `dist/contractor.js` reads. Hardcoding the number here would mean a
 * pg-boss upgrade silently leaving the database one version behind, which the worker would
 * then refuse to start against ("pg-boss database requires migrations").
 */
const TARGET_SCHEMA_VERSION: number = pgBossPackage.pgboss.schema;

/** Postgres role names, conservatively. The value arrives from a connection string. */
const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

interface AppRoleIdentity {
  readonly name: string;
  readonly password: string;
}

/**
 * Reads the application role's identity out of its connection string.
 *
 * A URL carries percent-encoded components, so both halves are decoded — a password
 * containing `@` or `/` has to be encoded in the URL and must not be created encoded.
 */
/** The attributes both new roles must have, and must keep. */
const ROLE_ATTRIBUTES = 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS';

interface RoleAttributes {
  readonly rolsuper: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolbypassrls: boolean;
  readonly rolcanlogin: boolean;
}

export function parseAppRoleIdentity(connectionString: string): AppRoleIdentity {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('APP_DATABASE_URL is not a URL, so the application role cannot be named from it.');
  }

  const name = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (!ROLE_NAME_PATTERN.test(name)) {
    throw new Error(
      `APP_DATABASE_URL must carry a user name matching ${ROLE_NAME_PATTERN} — the migrator creates the role from it. Received: ${JSON.stringify(name)}`,
    );
  }
  if (password.length === 0) {
    throw new Error('APP_DATABASE_URL must carry a password — the application role logs in with it.');
  }

  return { name, password };
}

/**
 * Refuses to run when the two connection strings do not name the same database.
 *
 * Without this the roles, the schema and the grants land in one database while the worker
 * connects to another, and the only symptom is the worker reporting "pg-boss is not
 * installed" — which reads like a migration that never ran rather than a typo.
 */
export function assertSameDatabase(ownerUrl: string, appUrl: string): void {
  const target = (raw: string, key: string): string => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error(`${key} is not a URL.`);
    }
    // Ports and paths are compared after defaulting, so `host/db` and `host:5432/db` are
    // recognised as the same target rather than reported as a mismatch.
    return `${url.hostname}:${url.port || '5432'}/${decodeURIComponent(url.pathname.replace(/^\//, ''))}`;
  };

  const owner = target(ownerUrl, 'DATABASE_URL');
  const app = target(appUrl, 'APP_DATABASE_URL');
  if (owner !== app) {
    throw new Error(
      `DATABASE_URL and APP_DATABASE_URL name different databases (${owner} vs ${app}). ` +
        'The roles, schema and grants would land in one and the worker would connect to the other.',
    );
  }
}

/**
 * Splits a pg-boss plan into the transactional block and whatever follows it.
 *
 * `getMigrationPlans` appends inlined `CREATE INDEX CONCURRENTLY` statements *after* the
 * COMMIT, and those cannot run inside a transaction block — which is what a multi-statement
 * simple query would put them in. pg-boss's own note says as much: "To apply
 * programmatically, use migrateCommands() and execute `concurrent` separately", and
 * `migrateCommands` is not exported. Splitting at the plan's own COMMIT gives the same
 * effect from the exported surface. The tail is empty for every migration in this release,
 * so this is insurance against a future pg-boss upgrade rather than a path exercised today.
 */
function splitAtTransactionEnd(plan: string): { transactional: string; afterCommit: string[] } {
  const marker = 'COMMIT;';
  const end = plan.lastIndexOf(marker);
  if (end === -1) return { transactional: plan, afterCommit: [] };

  const transactional = plan.slice(0, end + marker.length);
  const afterCommit = plan
    .slice(end + marker.length)
    .split(';\n')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && statement !== ';')
    .map((statement) => (statement.endsWith(';') ? statement : `${statement};`));

  return { transactional, afterCommit };
}

/**
 * The installed schema version, or `null` when the schema holds no pg-boss installation.
 *
 * "No installation" means the version table is absent. Every other shape is an error with a
 * name rather than a `null`: a present-but-empty version table is a half-installed schema
 * that re-running the construction plan would fail against halfway through, and a
 * non-numeric version would reach `getMigrationPlans(schema, NaN)` and assert deep inside
 * the library.
 */
async function installedVersion(client: pg.Client): Promise<number | null> {
  const present = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = 'version'
     ) AS exists`,
    [PGBOSS_SCHEMA],
  );
  if (!present.rows[0]?.exists) return null;

  const version = await client.query<{ version: string }>(
    `SELECT version FROM ${pg.escapeIdentifier(PGBOSS_SCHEMA)}.version LIMIT 1`,
  );
  const raw = version.rows[0]?.version;
  if (raw === undefined) {
    throw new Error(
      `Schema '${PGBOSS_SCHEMA}' has a version table with no row: it is half-installed. ` +
        'Drop the schema and re-run this step rather than migrating from an unknown version.',
    );
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      `Schema '${PGBOSS_SCHEMA}' records a non-numeric pg-boss version ${JSON.stringify(raw)}.`,
    );
  }
  return parsed;
}

async function ensureRoles(client: pg.Client, appRole: AppRoleIdentity): Promise<void> {
  const migrator = pg.escapeIdentifier(MIGRATOR_ROLE);
  const app = pg.escapeIdentifier(appRole.name);

  // ROLE_ATTRIBUTES is re-asserted on every run rather than only at creation. These are the
  // defaults for a new role, but a default is not a guarantee: a role someone granted
  // BYPASSRLS to by hand would otherwise keep it forever, silently defeating story 1.2's
  // isolation argument, and the DDL probe cannot see that.
  const attributesOf = async (role: string): Promise<RoleAttributes | null> => {
    const { rows } = await client.query<RoleAttributes>(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolcanlogin
         FROM pg_catalog.pg_roles WHERE rolname = $1`,
      [role],
    );
    return rows[0] ?? null;
  };

  const migratorAttributes = await attributesOf(MIGRATOR_ROLE);
  if (migratorAttributes === null) {
    await client.query(`CREATE ROLE ${migrator} NOLOGIN ${ROLE_ATTRIBUTES}`);
  } else if (
    migratorAttributes.rolsuper ||
    migratorAttributes.rolcreatedb ||
    migratorAttributes.rolcreaterole ||
    migratorAttributes.rolbypassrls ||
    migratorAttributes.rolcanlogin
  ) {
    await client.query(`ALTER ROLE ${migrator} WITH NOLOGIN ${ROLE_ATTRIBUTES}`);
  }

  const appAttributes = await attributesOf(appRole.name);
  if (appAttributes === null) {
    // The ONLY statement that carries the password. It is not re-issued on later runs:
    // `ALTER ROLE ... PASSWORD` would put the credential into pg_stat_activity and into any
    // `log_statement` capture on every run, against a security floor that says no credential
    // reaches logs. Rotating the password is therefore a deliberate operation, not a
    // side effect of re-running a migration.
    await client.query(
      `CREATE ROLE ${app} LOGIN ${ROLE_ATTRIBUTES} PASSWORD ${pg.escapeLiteral(appRole.password)}`,
    );
  } else if (
    appAttributes.rolsuper ||
    appAttributes.rolcreatedb ||
    appAttributes.rolcreaterole ||
    appAttributes.rolbypassrls ||
    !appAttributes.rolcanlogin
  ) {
    await client.query(`ALTER ROLE ${app} WITH LOGIN ${ROLE_ATTRIBUTES}`);
  }

  // The migrator creates the schema, which is a privilege held on the *database*.
  const database = await client.query<{ current_database: string }>('SELECT current_database()');
  const databaseName = database.rows[0]!.current_database;
  await client.query(
    `GRANT CREATE ON DATABASE ${pg.escapeIdentifier(databaseName)} TO ${migrator}`,
  );
}

async function installOrMigrate(client: pg.Client): Promise<string> {
  // Everything below runs as the migrator, so every object it creates is owned by the
  // migrator and not by whoever ran the script.
  await client.query(`SET ROLE ${pg.escapeIdentifier(MIGRATOR_ROLE)}`);
  try {
    const version = await installedVersion(client);

    if (version === null) {
      // The construction plan carries its own `CREATE SCHEMA IF NOT EXISTS`, BEGIN/COMMIT
      // and advisory lock, so it is handed to the server as one simple query.
      await client.query(getConstructionPlans(PGBOSS_SCHEMA));
      return `installed pg-boss schema '${PGBOSS_SCHEMA}' at version ${TARGET_SCHEMA_VERSION}`;
    }

    if (version === TARGET_SCHEMA_VERSION) {
      return `pg-boss schema '${PGBOSS_SCHEMA}' already at version ${version}; nothing to migrate`;
    }

    if (version > TARGET_SCHEMA_VERSION) {
      // Reporting success here would exit 0 and leave the worker unable to start at all:
      // pg-boss's `check()` demands an exact version match. A downgrade needs
      // `getRollbackPlans` and a decision about the jobs in flight, so it is named, not taken.
      throw new Error(
        `Schema '${PGBOSS_SCHEMA}' is at pg-boss version ${version}, ahead of this release's ` +
          `${TARGET_SCHEMA_VERSION}. The worker would refuse to start. Downgrading is a ` +
          'rollback decision, not a migration — do not run this step against it.',
      );
    }

    const { transactional, afterCommit } = splitAtTransactionEnd(
      getMigrationPlans(PGBOSS_SCHEMA, version),
    );
    await client.query(transactional);
    for (const statement of afterCommit) {
      await client.query(statement);
    }
    return `migrated pg-boss schema '${PGBOSS_SCHEMA}' from version ${version} to ${TARGET_SCHEMA_VERSION}`;
  } finally {
    await client.query('RESET ROLE');
  }
}

/**
 * USAGE on the schema and DML on its objects, and nothing else.
 *
 * Deliberately absent: CREATE on the schema (so DDL is refused — the point of the split),
 * TRUNCATE, and any ownership. Re-granting on every run is what covers objects a future
 * pg-boss migration adds, which is cheaper and more obvious than `ALTER DEFAULT
 * PRIVILEGES` state left behind in the catalog.
 *
 * EXECUTE on the schema's functions is not granted here because PostgreSQL grants it to
 * PUBLIC by default, and pg-boss's `create_queue` is a SECURITY INVOKER function: the app
 * role may call it, and the one branch inside it that performs DDL (a partitioned queue)
 * would still be refused, because the function runs with the caller's rights.
 */
async function grantAppRole(client: pg.Client, appRole: AppRoleIdentity): Promise<void> {
  const schema = pg.escapeIdentifier(PGBOSS_SCHEMA);
  const app = pg.escapeIdentifier(appRole.name);

  // Revoke first, so the step converges on this set instead of only adding to whatever is
  // already there. Without it a hand-issued `GRANT CREATE ON SCHEMA pgboss` — the very probe
  // that proves the restriction — survives every re-run, and the step would report a
  // restriction it had not actually restored. In one transaction so the role is never
  // momentarily without the access it is running on.
  await client.query('BEGIN');
  try {
    await client.query(`REVOKE ALL ON SCHEMA ${schema} FROM ${app}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${app}`);
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${app}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${app}`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function main(): Promise<void> {
  assertSameDatabase(config.DATABASE_URL, config.APP_DATABASE_URL);
  const appRole = parseAppRoleIdentity(config.APP_DATABASE_URL);

  // The owning connection. Role creation needs a role with CREATEROLE (the local and CI
  // `momo` role is the database superuser), and the DDL below is performed after SET ROLE.
  const client = new pg.Client({
    connectionString: config.DATABASE_URL,
    application_name: 'momo-pgboss-migrate',
  });
  await client.connect();
  try {
    await ensureRoles(client, appRole);
    const outcome = await installOrMigrate(client);
    await grantAppRole(client, appRole);
    console.log(`pgboss: ${outcome}; granted USAGE + DML to role '${appRole.name}'`);
  } finally {
    await client.end();
  }
}

// Run only when this file IS the program. Importing it — which
// `scripts/pgboss-migrate.test.ts` does, to exercise the parsing and the guards without a
// database — must not perform a migration as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
