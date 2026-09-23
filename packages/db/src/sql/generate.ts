/**
 * Renders the row-level-security, grant and append-only SQL from the table-class registry.
 *
 * These are pure functions of `table-classes.ts` — no database, no environment, no clock —
 * so the same text can be written to `packages/db/sql/*.sql`, applied by
 * `scripts/db-policies.ts`, and compared for drift by a test that needs no Postgres.
 *
 * Why generated SQL at all, rather than the ORM: Drizzle 0.45 cannot emit
 * `FORCE ROW LEVEL SECURITY`, and FORCE is the whole point — without it the policies are
 * skipped for the table's owner. Measured on 2026-09-20: as `momo`, a table with a policy
 * and without FORCE returns every row. So the statements live here and are asserted in CI
 * against `pg_class.relforcerowsecurity` and `pg_policies` rather than assumed to have run.
 *
 * Every statement is idempotent: `ALTER TABLE ... ENABLE/FORCE` is a no-op when already
 * set, policies and triggers are dropped before being created, and the grants revoke
 * before granting so the applied state *converges* on the registry instead of only ever
 * growing.
 */
import {
  APPEND_ONLY_GUARDED,
  appPrivilegesOf,
  CLIENT_ALLOCATED_SEQ,
  MAINTENANCE_SETTING,
  maintenancePrivilegesOf,
  TABLE_REGISTRY,
  TENANT_OWNED,
  TENANT_SETTING,
  type TableEntry,
} from '../table-classes';

/** The policy name every tenant-owned table carries. The catalog assertion looks for it. */
export const TENANT_POLICY = 'tenant_isolation';

/**
 * The second policy every tenant-owned table carries, granted to the maintenance role alone.
 *
 * Permissive policies are OR'd, and the tenant policy above applies to PUBLIC — which
 * includes the maintenance role. Without this one the escape hatch is unusable: a
 * maintenance session that had not ALSO set `app.tenant_id` would match zero rows, so the
 * hatch would appear to work (the trigger lets the statement through) and then update
 * nothing. Reaching a row is the whole point of a hatch.
 */
export const MAINTENANCE_POLICY = 'maintenance_bypass';

/** The row-level trigger name every append-only table carries. */
export const APPEND_ONLY_TRIGGER = 'append_only_guard';

/**
 * The statement-level trigger name every append-only table carries, for TRUNCATE.
 *
 * A FOR EACH ROW trigger does not fire for TRUNCATE — there are no rows to fire per — so
 * without this one TRUNCATE is guarded by the absent grant alone, which is exactly the
 * single point of failure the trigger exists to backstop. TRUNCATE also cannot be a BEFORE
 * ROW trigger at all; it has to be FOR EACH STATEMENT, hence the second name.
 */
export const APPEND_ONLY_TRUNCATE_TRIGGER = 'append_only_truncate_guard';

/** The row-level trigger function, shared by every append-only table. */
export const APPEND_ONLY_FUNCTION = 'momo_append_only_guard';

/** The statement-level (TRUNCATE) trigger function. */
export const APPEND_ONLY_TRUNCATE_FUNCTION = 'momo_append_only_truncate_guard';

/**
 * The SQLSTATE the append-only trigger raises.
 *
 * Deliberately NOT 42501 (insufficient_privilege): that is what the *missing grant* raises,
 * and the two halves of the double enforcement have to be distinguishable, or a test that
 * thinks it is watching the trigger is really watching the grant.
 */
export const APPEND_ONLY_ERRCODE = 'MOMO1';

/** A Postgres identifier, quoted. Every name here comes from the registry or a role name
 *  that has already been pattern-checked, but quoting is what makes that irrelevant. */
function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** A Postgres string literal. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function header(what: string): string {
  return [
    `-- ${what}`,
    '--',
    '-- GENERATED from packages/db/src/table-classes.ts by packages/db/src/sql/generate.ts.',
    '-- Do not edit: `pnpm db:sql` rewrites this file and a test fails when it has drifted.',
    '-- Applied by `pnpm db:policies`, which regenerates rather than reading this file, so a',
    '-- hand edit cannot reach a database either.',
    '',
  ].join('\n');
}

/**
 * `USING`/`WITH CHECK` for one tenant-owned table. Exported so `rls.test.ts` can compare the
 * *predicate the catalog actually holds* against this, rather than only checking that a
 * policy with the right name exists — a policy named `tenant_isolation` with `USING (true)`
 * leaks every Tenant's rows and passes a name check.
 *
 * `current_setting(..., true)` returns NULL rather than raising when the setting is absent,
 * and `tenant_id = NULL` is NULL, which is not true — so a read with no tenant set returns
 * no rows instead of erroring. `NULLIF(…, '')` folds the empty string into that same NULL:
 * without it, a `tenant_id` that is the empty string (nothing in the schema forbids one —
 * verified: Postgres accepts a `tenant` row with an empty id) would be matched by a session
 * that had set the tenant to `''`. `withTenant` refuses an empty id on the way in; this is
 * the same refusal at the other end, where it does not depend on the application.
 */
export function tenantPredicate(entry: TableEntry): string {
  return `${ident(entry.tenantColumn!)} = NULLIF(current_setting(${literal(TENANT_SETTING)}, true), '')`;
}

/** ENABLE + FORCE row-level security and the isolation policy, for every tenant-owned table. */
export function generateRlsSql(maintenanceRole: string): string {
  const maintenance = ident(maintenanceRole);
  const statements = TENANT_OWNED.flatMap((entry) => {
    const table = `public.${ident(entry.table)}`;
    const predicate = tenantPredicate(entry);
    return [
      `-- ${entry.table} (${entry.class}): ${entry.why}`,
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
      // FORCE is why this file exists: without it the policy is skipped for the table's
      // owner, and the owner is who `pnpm db:migrate` and the seed connect as.
      `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`,
      `DROP POLICY IF EXISTS ${ident(TENANT_POLICY)} ON ${table};`,
      `CREATE POLICY ${ident(TENANT_POLICY)} ON ${table}`,
      `  FOR ALL`,
      `  USING (${predicate})`,
      `  WITH CHECK (${predicate});`,
      // The hatch. Scoped to the maintenance role by `TO`, so it widens nothing for anybody
      // else; permissive policies OR together, so this is what lets a maintenance session
      // reach a row without also having to know which Tenant it belongs to.
      `DROP POLICY IF EXISTS ${ident(MAINTENANCE_POLICY)} ON ${table};`,
      `CREATE POLICY ${ident(MAINTENANCE_POLICY)} ON ${table}`,
      `  FOR ALL TO ${maintenance}`,
      `  USING (true)`,
      `  WITH CHECK (true);`,
      '',
    ];
  });

  return `${header('Row-level security: ENABLE + FORCE and the tenant isolation policy')}${statements.join('\n')}`;
}

/**
 * The grants, for the application role and the maintenance role.
 *
 * @param appRole the role the application connects as — taken from APP_DATABASE_URL at
 *   apply time, so the role the web app and worker log in as and the role named here
 *   cannot disagree.
 * @param maintenanceRole the escape-hatch role.
 */
export function generateGrantsSql(appRole: string, maintenanceRole: string): string {
  const app = ident(appRole);
  const maintenance = ident(maintenanceRole);

  const lines: string[] = [
    // Revoke first, so re-running converges instead of accumulating. Without it a grant
    // issued by hand — including the very probe that proves a restriction — survives every
    // later run and the step reports a restriction it did not restore.
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${app}, ${maintenance};`,
    `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${app}, ${maintenance};`,
    '',
    `GRANT USAGE ON SCHEMA public TO ${app}, ${maintenance};`,
    '',
  ];

  for (const entry of TABLE_REGISTRY) {
    const table = `public.${ident(entry.table)}`;
    const appPrivileges = appPrivilegesOf(entry);
    const maintenancePrivileges = maintenancePrivilegesOf(entry);
    lines.push(`-- ${entry.table} (${entry.class})`);
    if (appPrivileges.length > 0) {
      lines.push(`GRANT ${appPrivileges.join(', ')} ON ${table} TO ${app};`);
    }
    if (maintenancePrivileges.length > 0) {
      lines.push(`GRANT ${maintenancePrivileges.join(', ')} ON ${table} TO ${maintenance};`);
    }
    lines.push('');
  }

  lines.push(
    '-- Identity columns need their sequence. USAGE only: no SELECT-and-setval, and no',
    '-- ownership, so the application role can allocate a value and nothing else.',
    `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${app};`,
    '',
    '-- The caller-allocated `seq` allocators. EXECUTE is revoked from PUBLIC first, because',
    '-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default and these are',
    '-- SECURITY DEFINER: leaving that default would hand every role the owner\'s read of the',
    '-- whole table, which is the opposite of what they are for.',
  );
  for (const entry of CLIENT_ALLOCATED_SEQ) {
    const fn = `public.${ident(seqAllocatorName(entry.table))}()`;
    lines.push(
      `REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`,
      `GRANT EXECUTE ON FUNCTION ${fn} TO ${app};`,
    );
  }
  lines.push('');

  return `${header('Grants: what each role holds, by table class, and nothing more')}${lines.join('\n')}`;
}

/**
 * The append-only trigger function and one trigger per append-only table.
 *
 * The second half of the double enforcement. The missing UPDATE/DELETE grant already stops
 * the application role, but a grant is a property of a role: the owner, a future role, or
 * anyone granted more by accident walks straight past it. The trigger is a property of the
 * *table*, so it refuses everybody who has not deliberately opened the escape hatch.
 *
 * The hatch is both halves at once: the `maintenance` role AND `app.maintenance = 'on'`.
 * A role alone would make every maintenance connection dangerous; a flag alone would let
 * any role set it.
 */
export function generateTriggersSql(maintenanceRole: string): string {
  // The hatch condition, shared by both guards.
  //
  // The role's EXISTENCE is checked before `pg_has_role` is called, because `pg_has_role`
  // raises 42704 (undefined_object) on a role that is not there — which would make "the
  // maintenance role was never created" indistinguishable from any other catalog error, and
  // would mask the MOMO1 this function exists to raise. Existence-first means a database
  // without the hatch role simply has no hatch, and says so with the right code.
  //
  // `SET search_path` is pinned on both functions below. Without it `current_setting`,
  // `pg_has_role` and `nullif` resolve through the CALLER's search_path, and a caller who
  // can create objects in a schema earlier on that path can shadow them — which for a
  // SECURITY DEFINER function is a privilege escalation and for a guard is simply a way to
  // switch the guard off.
  const hatch = [
    `  IF current_setting(${literal(MAINTENANCE_SETTING)}, true) = 'on'`,
    `     AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${literal(maintenanceRole)})`,
    `     AND pg_catalog.pg_has_role(current_user, ${literal(maintenanceRole)}, 'USAGE') THEN`,
  ];

  const refusal = (what: string) => [
    `  RAISE EXCEPTION 'table %.% is append-only: % is refused', TG_TABLE_SCHEMA, TG_TABLE_NAME, ${what}`,
    `    USING ERRCODE = ${literal(APPEND_ONLY_ERRCODE)},`,
    `          HINT = 'Append a compensating row. The only exception is the ${maintenanceRole} role with ${MAINTENANCE_SETTING} set to on.';`,
  ];

  const lines: string[] = [
    `CREATE OR REPLACE FUNCTION public.${ident(APPEND_ONLY_FUNCTION)}() RETURNS trigger`,
    'LANGUAGE plpgsql',
    'SET search_path = pg_catalog, pg_temp',
    'AS $$',
    'BEGIN',
    ...hatch,
    // NEW is null in a DELETE trigger and OLD is null in an INSERT one; plpgsql will not
    // COALESCE two record variables, so the branch is written out.
    "    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;",
    '  END IF;',
    ...refusal('TG_OP'),
    'END $$;',
    '',
    // TRUNCATE needs its own function because it must be FOR EACH STATEMENT: a row trigger
    // does not fire for it at all, and a statement trigger returns NULL rather than a record.
    `CREATE OR REPLACE FUNCTION public.${ident(APPEND_ONLY_TRUNCATE_FUNCTION)}() RETURNS trigger`,
    'LANGUAGE plpgsql',
    'SET search_path = pg_catalog, pg_temp',
    'AS $$',
    'BEGIN',
    ...hatch,
    '    RETURN NULL;',
    '  END IF;',
    ...refusal("'TRUNCATE'"),
    'END $$;',
    '',
  ];

  for (const entry of APPEND_ONLY_GUARDED) {
    const table = `public.${ident(entry.table)}`;
    lines.push(
      `-- ${entry.table}: ${entry.why}`,
      `DROP TRIGGER IF EXISTS ${ident(APPEND_ONLY_TRIGGER)} ON ${table};`,
      `CREATE TRIGGER ${ident(APPEND_ONLY_TRIGGER)}`,
      `  BEFORE UPDATE OR DELETE ON ${table}`,
      `  FOR EACH ROW EXECUTE FUNCTION public.${ident(APPEND_ONLY_FUNCTION)}();`,
      `DROP TRIGGER IF EXISTS ${ident(APPEND_ONLY_TRUNCATE_TRIGGER)} ON ${table};`,
      `CREATE TRIGGER ${ident(APPEND_ONLY_TRUNCATE_TRIGGER)}`,
      `  BEFORE TRUNCATE ON ${table}`,
      `  FOR EACH STATEMENT EXECUTE FUNCTION public.${ident(APPEND_ONLY_TRUNCATE_FUNCTION)}();`,
      '',
    );
  }

  // The `seq` allocators.
  //
  // `MAX(seq) + 1` computed by the application is wrong the moment row-level security is on:
  // the maximum a Tenant can see is its own, so two Tenants each compute the same next value
  // and collide on a key that is unique across all of them. These functions read the true
  // maximum as the table OWNER (SECURITY DEFINER), so the allocation stops depending on what
  // the caller may see. They disclose a row count and nothing else.
  //
  // This is NOT the watermark discipline the architecture asks for — that takes
  // `pg_advisory_xact_lock` before allocating and belongs to the slice that owns it. It is
  // the narrowest thing that stops a cross-tenant primary-key collision being a live bug.
  for (const entry of CLIENT_ALLOCATED_SEQ) {
    const fn = seqAllocatorName(entry.table);
    lines.push(
      `-- ${entry.table}: caller-allocated seq, so the maximum must be read as the owner.`,
      `CREATE OR REPLACE FUNCTION public.${ident(fn)}() RETURNS bigint`,
      'LANGUAGE sql SECURITY DEFINER',
      'SET search_path = pg_catalog, pg_temp',
      `AS $$ SELECT COALESCE(MAX(seq), 0) + 1 FROM public.${ident(entry.table)} $$;`,
      '',
    );
  }

  return `${header('Append-only enforcement: the UPDATE/DELETE and TRUNCATE triggers, and the seq allocators')}${lines.join('\n')}`;
}

/** The name of the SECURITY DEFINER allocator for a caller-allocated `seq`. */
export function seqAllocatorName(table: string): string {
  return `momo_next_${table}_seq`;
}

/**
 * The three files, by their name under `packages/db/sql/`.
 *
 * INSERTION ORDER IS APPLY ORDER: `scripts/db-policies.ts` iterates these entries. Triggers
 * come before grants because the grants file grants EXECUTE on the `seq` allocator functions
 * the triggers file creates — the other order fails with "function does not exist".
 */
export function generateAll(
  appRole: string,
  maintenanceRole: string,
): Readonly<Record<string, string>> {
  return {
    'rls.sql': generateRlsSql(maintenanceRole),
    'triggers.sql': generateTriggersSql(maintenanceRole),
    'grants.sql': generateGrantsSql(appRole, maintenanceRole),
  };
}
