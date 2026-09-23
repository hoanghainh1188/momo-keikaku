import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { hours, present, stringify } from '@momo/domain';
import type { AppError } from '../packages/app/src/result';
import { getProjectReview } from '../packages/app/src/use-cases';
import { closeAllPools, getDb, getPool, schema, type Db } from '../packages/db/src/client';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../packages/db/src/seed-suite-lock';
import { buildDemoState } from '../packages/db/src/fixtures';
import {
  DEMO_PROJECT_ID,
  DEMO_TENANT_ID,
  loadProjectBundle,
  loadReview,
} from '../packages/db/src/repo';
import { listAuditLog } from '../packages/db/src/repo-audit';
import { lookupUserOn } from '../packages/db/auth/src/identity';
import {
  READ_SURFACE_MODULE,
  READ_USE_CASES,
  REGISTRY_MODULE,
  UNREACHED_TENANT_OWNED_TABLES,
  readSurfaceFunctionNames,
  type HarnessReadDeps,
  type ReadUseCase,
  type UseCaseTarget,
} from './read-use-cases';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  demoMarkers,
  removeProbeTenant,
  type ProbeTenant,
} from '../packages/db/src/probe-tenants';
import { REGISTERED_TABLES, TENANT_OWNED } from '../packages/db/src/table-classes';
import { withTenant } from '../packages/db/src/with-tenant';
import { pmContextFor } from './request-context';

/**
 * THE CROSS-TENANT HARNESS. This is the automated test NFR-S1 asks for.
 *
 * `rls.test.ts` proves the machinery: FORCE is on, the policies carry the right predicate,
 * a read with no tenant returns nothing. What it does NOT do is test what a user actually
 * invokes. It probes three tables by hand out of sixteen, and nothing in it fails when a
 * new read is added with no isolation cover. This file is the other half, and the two
 * together are what discharge NFR-S1.
 *
 * FIVE CLAIMS LIVE HERE, each failing for its own reason:
 *
 *   1. THE ENUMERATION IS MECHANICAL. The covered set is read off the read surface's module
 *      namespace — `packages/app`'s use cases since story 1.2 slice 3, when the harness
 *      moved here from `packages/db` — not written by hand, so an exported read with no
 *      registry entry fails NAMING IT — with no database, which is the point: the gap is
 *      caught on a laptop with nothing running.
 *   2. THE RELABELLING IS FAITHFUL. A probe Tenant is a bijectively relabelled copy of the
 *      demo dataset, and the Review computed over it reproduces the pinned golden figures
 *      (2936.0 / 1661.5 / 0.91). Without this, every isolation assertion below could agree
 *      perfectly about the wrong data.
 *   3. ISOLATION HOLDS, GENERICALLY. Every registry entry is invoked against both probe
 *      Tenants as the RESTRICTED role, and the whole result graph — including `Map` keys
 *      and values, which `JSON.stringify` cannot see and which is exactly where
 *      `attribution` keeps Work Package and Ticket ids — is walked for the other Tenant's
 *      token and for the demo Tenant's markers. No per-field allow-list, so a use case's
 *      new fields are covered the day they are written.
 *   4. THE RESULTS ARE COMPLETE, NOT MERELY NON-EMPTY. THREE independent completeness
 *      assertions, because "returned nothing" passes an isolation check trivially: the two
 *      probes' results are identical after token substitution (compared as MULTISETS,
 *      because four of the reads carry no ORDER BY); every label the relabeller assigned to
 *      a string the DEMO Tenant's own result carries appears in the probe's result too; and
 *      — the absolute floor, because the first two are relative and a read that lost the
 *      same field for EVERY Tenant passes both — every fixture value the registry's
 *      `mustSurface` names comes back. A fourth assertion compares the full NUMERIC census
 *      against the demo Tenant's, which is what makes a forgotten vocabulary entry loud.
 *   5. EVERY TENANT-OWNED TABLE A USE CASE READS IS ISOLATED AT TABLE LEVEL, over the
 *      MEASURED reach set. Claim 3 alone does not reach this: ten of the fifteen reads
 *      carry a `WHERE` on a Project or a row id, and those ids are relabelled, so a foreign
 *      row would be filtered out by the predicate before row-level security was ever
 *      consulted — an over-permissive policy on `work_package`, `mapping_rule` or
 *      `baseline_version` would leak nothing into a RESULT while leaking everything to any
 *      query without that predicate. So each reached table is also read directly inside
 *      `withTenant`, and every row is checked for a foreign token. This is the assertion
 *      that makes the acceptance criterion's "any tenant-owned table" true rather than
 *      true of five of them.
 *
 * THE WRITES live in `tests/cross-tenant-writes.test.ts` (story 1.2 slice 4). They are on the
 * same enumerated surface, so claim 1's gate below names an unregistered write exactly as it
 * names an unregistered read; that file drives every entry of `kind: 'write'` — a
 * foreign-Tenant write must answer `not_found` and land nothing in any tenant-owned table, an
 * own-Tenant write must land exactly the rows the action always wrote.
 *
 * And it says what it does not reach: `read-use-cases.ts` declares the tenant-owned tables
 * no use case touches, and the declaration is compared against what a Drizzle query logger
 * MEASURES rather than against what anybody believes.
 *
 * WHY THE USE CASES AND NOT THE REPOSITORY. The pages call `packages/app`'s use cases, so
 * those are what a user invokes, and driving them proves one thing the repository-level
 * enumeration could not: that no use case WIDENED what the repository returns. A use case
 * that swallowed the repository's failure and answered with a default fails the completeness
 * assertions here; one that let a foreign Project id throw, or answered it with anything but
 * `not_found`, fails the cross-Tenant probe. This file is therefore a composition root of its
 * own — it wires `packages/db`'s repository into `packages/app`'s port, on the restricted
 * role's handle — which is why it lives in `tests/`, outside every layer.
 *
 * Requires a database prepared by `pnpm db:migrate`, `pnpm pgboss:migrate` and
 * `pnpm db:policies`, and seeded. Set REQUIRE_DB=1 (CI does) to turn an unreachable
 * database into a failure instead of a skip. The pure gate above runs either way.
 */

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

/**
 * The two probe Tenants.
 *
 * Their `seq` bands are far from the demo's (1..184) and from `rls.test.ts`'s probe row
 * (9_000_001), because vitest runs files in parallel and `actuals_ledger_entry.seq` and
 * `mapping_event.seq` are GLOBAL primary keys the caller allocates — a shared band is a
 * primary-key collision that would surface as a flake in whichever file lost the race.
 */
const PROBE_A = buildProbeTenant('xtprobe-a', 700_000_000);
const PROBE_B = buildProbeTenant('xtprobe-b', 710_000_000);
// Neither token a substring of the other, and neither seq band touching the other, the
// demo seed's, or `rls.test.ts`'s. At module load, so a future edit fails by name here
// rather than as a duplicate-key error inside `beforeAll` — or, for the tokens, as an
// isolation assertion that silently cannot tell the two Tenants apart.
assertProbeTenantsDisjoint([PROBE_A, PROBE_B]);

if (REQUIRE_DB && !(OWNER_DATABASE_URL && APP_DATABASE_URL)) {
  throw new Error(
    'REQUIRE_DB=1 but DATABASE_URL and APP_DATABASE_URL are not both set. This file needs the ' +
      'owner to write the probe Tenants — `tenant` is `global`, and the probes must exist ' +
      'outside the application role\'s reach — and the application role to drive the reads. ' +
      'It is the harness NFR-S1 rests on, so it must not be skipped here.',
  );
}

async function reachableAs(connectionString: string | undefined): Promise<boolean> {
  if (!connectionString) return false;
  try {
    const client = await getPool(connectionString).connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

const reachable =
  (await reachableAs(OWNER_DATABASE_URL)) && (await reachableAs(APP_DATABASE_URL));

if (REQUIRE_DB && !reachable) {
  throw new Error(
    'REQUIRE_DB=1 but the database is not reachable as both roles. Run `pnpm pgboss:migrate` ' +
      'and `pnpm db:policies` first; this harness is what discharges NFR-S1, so it must not ' +
      'be skipped.',
  );
}

// This suite writes probe Tenants, so it holds the seed-suite lock shared for its lifetime
// (`tests/seed-suite-lock.ts`, retrospective F1). It builds its own connections rather than
// going through `connectWriteHarness`, which is where every other probe suite picks this up,
// so it has to ask for itself. `closeAllPools()` below drops it with the session.
if (reachable) {
  await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');
}

// --- the pure gate -----------------------------------------------------------------------

describe('the read surface is enumerated mechanically, not listed by hand', () => {
  it('has a registry entry for every exported function of the read surface', () => {
    const exported = readSurfaceFunctionNames();
    const registered = READ_USE_CASES.map((entry) => entry.name);
    const uncovered = exported.filter((name) => !registered.includes(name));

    // Named, not counted: whoever added the export is sent to the registry with the name
    // in hand. This assertion needs no database at all — that is what makes it a gate a
    // developer trips on before CI does.
    expect(
      uncovered,
      `these functions are exported from ${READ_SURFACE_MODULE} and have no entry in ` +
        `${REGISTRY_MODULE}: ${uncovered.join(', ')}. Every read is driven ` +
        'against two probe Tenants by tests/cross-tenant.test.ts, and every write by ' +
        'tests/cross-tenant-writes.test.ts; an export with no entry is a use case with no ' +
        'isolation cover.',
    ).toEqual([]);
  });

  it('names no entry that the read surface does not export', () => {
    const exported = readSurfaceFunctionNames();
    const stale = READ_USE_CASES.map((entry) => entry.name).filter(
      (name) => !exported.includes(name),
    );
    expect(
      stale,
      `these registry entries name functions ${READ_SURFACE_MODULE} does not export: ` +
        `${stale.join(', ')}. A stale entry is a use case the harness reports as covered ` +
        'and never invokes.',
    ).toEqual([]);
  });

  it('gives every entry what its kind requires', () => {
    const broken: string[] = [];
    for (const entry of READ_USE_CASES) {
      if (entry.kind === 'read' && typeof entry.invoke !== 'function') {
        broken.push(`${entry.name}: kind 'read' with no invoke — it would never be driven`);
      }
      if (entry.kind === 'read' && typeof entry.mustSurface !== 'function') {
        broken.push(
          `${entry.name}: kind 'read' with no mustSurface — nothing would then fail if the ` +
            'use case returned the same empty result for every Tenant',
        );
      }
      if (entry.kind === 'write' && typeof entry.invokeWrite !== 'function') {
        broken.push(`${entry.name}: kind 'write' with no invokeWrite — it would never be driven`);
      }
      if (entry.kind !== 'write' && entry.invokeWrite !== undefined) {
        broken.push(
          `${entry.name}: kind '${entry.kind}' with an invokeWrite — the write suite drives ` +
            'only entries of kind \'write\', so this invoker would never run',
        );
      }
      if (entry.kind === 'write' && (entry.invoke !== undefined || entry.mustSurface !== undefined)) {
        broken.push(
          `${entry.name}: kind 'write' with a read's invoke/mustSurface — a write is not ` +
            'driven through the read matrix, so these would be dead',
        );
      }
      if (entry.kind === 'not-a-read' && !entry.reason) {
        broken.push(`${entry.name}: kind 'not-a-read' with no stated reason`);
      }
      if (!entry.why) broken.push(`${entry.name}: no 'why'`);
    }
    // And at least one entry must actually BE a read. Without this, marking every entry
    // `not-a-read` with a plausible reason empties the whole probe matrix — every database
    // suite below becomes zero iterations — while all four assertions here stay green.
    if (!READ_USE_CASES.some((entry) => entry.kind === 'read')) {
      broken.push(
        'no entry is a read, so the probe matrix would drive nothing at all. A read surface ' +
          'with no reads in it is a registry that has been emptied, not a surface that has ' +
          'none.',
      );
    }
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('declares only registered, tenant-owned tables as unreached', () => {
    // The unreached set is about ISOLATION, so it can only name tables that have a tenant
    // policy to be tested. A `global` table listed here would read as covered ground.
    const notTenantOwned = UNREACHED_TENANT_OWNED_TABLES.map((entry) => entry.table).filter(
      (table) => !TENANT_OWNED.some((owned) => owned.table === table),
    );
    expect(
      notTenantOwned,
      `these tables are declared unreached but are not tenant-owned: ${notTenantOwned.join(', ')}`,
    ).toEqual([]);

    const unexplained = UNREACHED_TENANT_OWNED_TABLES.filter((entry) => !entry.why).map(
      (entry) => entry.table,
    );
    expect(unexplained, `declared unreached with no reason: ${unexplained.join(', ')}`).toEqual(
      [],
    );
  });
});

// --- the graph walk, the token scan and the two completeness comparisons -------------------

/**
 * Keys whose numeric value the DATABASE allocates, and which therefore cannot agree
 * between two Tenants however identical their data is.
 *
 * `baseline_version.seq` is `generatedAlwaysAsIdentity`, so the two probes get 2 and 3;
 * `actuals_ledger_entry.seq` and `mapping_event.seq` are caller-allocated global primary
 * keys, so the two probes come out of different bands on purpose. Normalising them by KEY
 * NAME (not by value, which would also hit `priority: 2`, and not by path, which would be
 * per-use-case knowledge) is what lets the symmetry comparison below be about the data.
 */
const ALLOCATED_SEQ_KEYS: ReadonlySet<string> = new Set([
  'seq',
  'activeBaselineSeq',
  'activeBaselineVersionSeq',
]);

/**
 * Visits every primitive leaf in a result graph, including `Map` keys and `Set` members.
 *
 * `JSON.stringify` renders a `Map` as `{}`, so a scan built on it would walk straight past
 * `attribution.acByWp` and `attribution.hoursByTicket` — the two places a Review keeps raw
 * Work Package and Ticket ids. That is the exact shape of a leak this harness exists to
 * catch, so the walk is written by hand rather than borrowed from a serialiser.
 *
 * `key` is the object field the leaf sits under, or `null` inside an array of scalars, a
 * `Map` or a `Set`.
 */
function walkLeaves(
  root: unknown,
  visit: (value: unknown, path: string, key: string | null) => void,
): void {
  const seen = new Set<object>();
  const go = (node: unknown, path: string, key: string | null): void => {
    if (node === null || typeof node !== 'object') {
      visit(node, path, key);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    if (node instanceof Date) return;
    if (node instanceof Map) {
      let index = 0;
      for (const [entryKey, value] of node) {
        go(entryKey, `${path}<key ${index}>`, null);
        go(value, `${path}<value ${index}>`, null);
        index += 1;
      }
      return;
    }
    if (node instanceof Set) {
      let index = 0;
      for (const value of node) go(value, `${path}<member ${index++}>`, null);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((value, index) => go(value, `${path}[${index}]`, key));
      return;
    }
    for (const [field, value] of Object.entries(node)) go(value, `${path}.${field}`, field);
  };
  go(root, '$', null);
}

/** The string leaves only, which is what every isolation and census assertion walks. */
function walkStrings(root: unknown, visit: (value: string, path: string) => void): void {
  walkLeaves(root, (value, path) => {
    if (typeof value === 'string') visit(value, path);
  });
}

/**
 * Every number in a result graph, sorted — the DATABASE-allocated sequences excluded.
 *
 * The relabelling rewrites strings and nothing else, so a probe Tenant's result must be
 * NUMERICALLY identical to the demo Tenant's. That is a far stronger faithfulness check
 * than the three pinned headline figures, and it is generic: it covers every figure a use
 * case will ever return, including the ones nobody thought to pin. Measured on 2026-09-21:
 * relabelling `'opening_balance'` or `'manual'` moves `openingBalanceMh` and
 * `rules[].currentlyMapped` without touching BAC, AC or SPI at all, so the headline figures
 * alone do not close the vocabulary question.
 */
function numberCensus(graph: unknown): (number | bigint)[] {
  // `bigint` as well as `number` (AD-4): effort and money are `bigint` milli-hours and yen, and
  // a census that looked only at `number` would silently drop every figure that matters —
  // BAC, AC, PV, EV, every ratio's numerator and denominator — and pass about the counts.
  const numbers: (number | bigint)[] = [];
  walkLeaves(graph, (value, _path, key) => {
    if (typeof value !== 'number' && typeof value !== 'bigint') return;
    if (key !== null && ALLOCATED_SEQ_KEYS.has(key)) return;
    numbers.push(value);
  });
  return numbers.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}


const PROBE_PLACEHOLDER = '<probe>';

/** The key of the one sanctioned float, `present`'s `earnedProgress(...).fraction`. */
const GEOMETRY_KEY = 'fraction';

function sortBySerialisation(items: unknown[]): unknown[] {
  // Keys precomputed: `sort` with a stringifying comparator serialises the same element
  // O(log n) times, and these arrays carry whole Ticket observations.
  //
  // Serialised through the domain's codec (AD-4), not `JSON.stringify`: the graphs carry
  // `bigint` milli-hours and `Ratio`s, which `JSON.stringify` throws on — and the codec also
  // refuses a float, so a float that crept back into a result fails here, naming its path.
  return items
    .map((item) => [stringify(item), item] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, item]) => item);
}

/**
 * Puts one probe's result into a form the other probe's can be compared against.
 *
 * Arrays become MULTISETS (sorted by their own serialisation), because four of the fifteen
 * reads carry no `ORDER BY` — `baseline_wp` among them — so Postgres is free to hand the
 * two Tenants their rows in different orders and both are correct.
 */
function canonicalise(node: unknown, token: string, key: string | null): unknown {
  if (node === undefined) return '<undefined>';
  if (node === null) return null;
  if (typeof node === 'string') return node.replaceAll(token, PROBE_PLACEHOLDER);
  if (typeof node === 'number') {
    if (key !== null && ALLOCATED_SEQ_KEYS.has(key)) return '<seq>';
    // The ONE sanctioned float in any result (AD-4): `earnedProgress`'s layout-geometry
    // `fraction`, which the Client View's schedule carries so the Gantt can draw its fill. It
    // is compared as its exact decimal text, because the codec below refuses every float —
    // which is what keeps a float creeping back into a figure loud, under any other key.
    if (key === GEOMETRY_KEY && !Number.isInteger(node)) return `<geometry ${String(node)}>`;
    return node;
  }
  if (typeof node !== 'object') return node;
  if (node instanceof Date) return node.toISOString();
  if (node instanceof Map) {
    return {
      '<map>': sortBySerialisation(
        [...node].map(([k, v]) => [canonicalise(k, token, null), canonicalise(v, token, null)]),
      ),
    };
  }
  if (node instanceof Set) {
    return { '<set>': sortBySerialisation([...node].map((v) => canonicalise(v, token, null))) };
  }
  if (Array.isArray(node)) {
    return sortBySerialisation(node.map((item) => canonicalise(item, token, key)));
  }
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(node as Record<string, unknown>).sort()) {
    out[field] = canonicalise((node as Record<string, unknown>)[field], token, field);
  }
  return out;
}

/** Every string in `graph` that the relabeller had a label for, as the ORIGINAL string. */
function originalsIn(graph: unknown, universe: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  walkStrings(graph, (value) => {
    if (universe.has(value)) found.add(value);
  });
  return [...found].sort();
}

/** The same census on a probe's result, decoded back through the relabelling. */
function decodedOriginalsIn(graph: unknown, inverse: ReadonlyMap<string, string>): string[] {
  const found = new Set<string>();
  walkStrings(graph, (value) => {
    const original = inverse.get(value);
    if (original !== undefined) found.add(original);
  });
  return [...found].sort();
}

const DEMO_STATE = buildDemoState();
const DEMO_MARKERS = demoMarkers(DEMO_STATE);
const DEMO_MARKER_PATTERN = new RegExp(
  DEMO_MARKERS.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

/** Every string in `graph` carrying `token`, or one of the demo Tenant's markers. */
function foreignStringsIn(graph: unknown, token: string): string[] {
  const offenders: string[] = [];
  walkStrings(graph, (value, path) => {
    if (value.includes(token)) offenders.push(`${path} = ${JSON.stringify(value)} (token ${token})`);
    const marker = DEMO_MARKER_PATTERN.exec(value);
    if (marker) {
      offenders.push(`${path} = ${JSON.stringify(value)} (demo marker ${JSON.stringify(marker[0])})`);
    }
  });
  return offenders;
}

// --- the probe matrix ----------------------------------------------------------------------

interface Outcome {
  /** The use case's `ok` value, or `undefined` when it rejected or answered an error arm. */
  readonly value?: unknown;
  /** What the use case THREW. A use case's own failures are an error arm, not a throw. */
  readonly error?: unknown;
  /** The use case's error arm, when it answered one. */
  readonly refused?: AppError;
  /** The registered tables named in the SQL this invocation issued. */
  readonly tables: ReadonlySet<string>;
}

const READS: readonly ReadUseCase[] = READ_USE_CASES.filter((entry) => entry.kind === 'read');

/** Per use case: the demo Tenant's result, each probe's result, and the cross-Tenant probe. */
const outcomes = new Map<string, { demo: Outcome; a: Outcome; b: Outcome; cross: Outcome }>();
/** Every registered table any use case was measured reading. */
const reached = new Set<string>();

/** The sink the query logger writes into while one invocation is in flight. */
let sink: Set<string> | null = null;
let restricted: Db | null = null;

function owner(): Db {
  return getDb(OWNER_DATABASE_URL!);
}

/**
 * The port, wired: `packages/db`'s repository functions as `packages/app` declares them, on
 * the RESTRICTED role's logging handle. The `satisfies` is the same structural check the web
 * app's composition root makes — this file is a composition root too.
 */
function restrictedDeps(): HarnessReadDeps {
  return {
    handle: restricted!,
    projectRead: { loadProjectBundle, loadReview },
    auditLogRead: { list: listAuditLog },
    lookupUser: (userId) => lookupUserOn(restricted!, userId),
  } satisfies HarnessReadDeps;
}

/**
 * Splits a use case's `Result` into the Outcome's arms. Anything that is not a `Result` is
 * itself a failure: the registry's contract is that `invoke` hands back what the use case
 * returned, and a raw value would mean an entry had stepped around the use case.
 */
function settle(returned: unknown, tables: Set<string>, name: string): Outcome {
  if (returned !== null && typeof returned === 'object' && 'ok' in returned) {
    const result = returned as { ok: boolean; value?: unknown; error?: AppError };
    if (result.ok === true) return { value: result.value, tables };
    if (result.ok === false && result.error) return { refused: result.error, tables };
  }
  return {
    error: new Error(
      `${name} did not return a Result — its registry entry is bypassing the use case, or the ` +
        'use case no longer answers in packages/app\'s Result<T, AppError> shape.',
    ),
    tables,
  };
}

/**
 * The RESTRICTED role's handle, with a logger.
 *
 * `getPool` is exported, so the harness builds its own Drizzle handle over the same pool
 * rather than reaching into `getDb`. The logger is how the reached-table set is MEASURED:
 * a declared list compared against another declared list proves nothing.
 */
function buildRestricted(): Db {
  return drizzle(getPool(APP_DATABASE_URL!), {
    schema,
    logger: {
      logQuery(query: string): void {
        if (!sink) return;
        // Quoted on both sides, so `"tenant"` does not match inside `"tenant_id"`.
        for (const table of REGISTERED_TABLES) if (query.includes(`"${table}"`)) sink.add(table);
      },
    },
  });
}

async function invokeMeasured(entry: ReadUseCase, target: UseCaseTarget): Promise<Outcome> {
  const tables = new Set<string>();
  // `sink` is a single module-level slot, so two invocations in flight at once would each
  // attribute the other's tables to themselves — silently narrowing the measured reach set
  // and, with it, the table-level gate that iterates over it. Refuse rather than measure
  // the wrong thing: the day someone runs the registry in parallel, this says so.
  if (sink !== null) {
    throw new Error(
      `invokeMeasured(${entry.name}) started while another invocation was still measuring. ` +
        'The query logger writes into one slot, so the reach measurement — and the ' +
        'table-level isolation gate built on it — would be attributed to the wrong use case.',
    );
  }
  sink = tables;
  try {
    return settle(await entry.invoke!(restrictedDeps(), target), tables, entry.name);
  } catch (error) {
    return { error, tables };
  } finally {
    sink = null;
  }
}

/**
 * How many relabelled strings a read's demo result must carry before "the probe carries the
 * same labels" means anything. An entry whose result is legitimately smaller states its own
 * floor, and why, in the registry (`minimumLabels`).
 */
const DEFAULT_MINIMUM_LABELS = 100;

/** Rethrows with the use case named, so a broken own-Tenant read is not a bare stack. */
function required(entry: ReadUseCase, label: string, outcome: Outcome): unknown {
  if (outcome.refused) {
    // An own-Tenant read answering an error arm is as broken as one that threw: the Project
    // is the caller's own, so `not_found` here means the use case lost it.
    throw new Error(
      `${entry.name} answered ${outcome.refused.code} against ${label}, for a Project that ` +
        'Tenant owns, so nothing below it can be asserted.',
    );
  }
  if (outcome.error) {
    throw new Error(
      `${entry.name} failed against ${label}, so nothing below it can be asserted: ` +
        `${String(outcome.error)}`,
      { cause: outcome.error },
    );
  }
  return outcome.value;
}

/**
 * Everything below needs the database. It is wrapped in one suite so that the pure gate
 * above still runs — and still fails — when the probe Tenants cannot be written at all.
 */
describe.skipIf(!reachable)('the cross-tenant harness, driven against two probe Tenants', () => {
  beforeAll(async () => {
    restricted = buildRestricted();
    await createProbeTenant(owner(), PROBE_A);
    await createProbeTenant(owner(), PROBE_B);

    for (const entry of READS) {
      const demo = await invokeMeasured(entry, {
        tenantId: DEMO_TENANT_ID,
        projectId: DEMO_PROJECT_ID,
      });
      const a = await invokeMeasured(entry, {
        tenantId: PROBE_A.tenantId,
        projectId: PROBE_A.projectId,
      });
      const b = await invokeMeasured(entry, {
        tenantId: PROBE_B.tenantId,
        projectId: PROBE_B.projectId,
      });
      // The id-from-a-URL shape: Tenant B asking for Tenant A's Project id.
      const cross = await invokeMeasured(entry, {
        tenantId: PROBE_B.tenantId,
        projectId: PROBE_A.projectId,
      });
      outcomes.set(entry.name, { demo, a, b, cross });
      for (const table of a.tables) reached.add(table);
    }
  }, 180_000);

  afterAll(async () => {
    // `pnpm seed` refuses to run beside a second Tenant, so a leaked probe Tenant is a
    // broken workspace, not an untidy one — and this hook matters most exactly when
    // something already went wrong, which is when `beforeAll` died part-way through writing
    // a probe. So each removal gets its own try: a failure removing A must not be the reason
    // B is still there, and neither must be the reason the verification below never ran.
    const failures: string[] = [];
    for (const probe of [PROBE_A, PROBE_B]) {
      try {
        await removeProbeTenant(owner(), probe);
      } catch (error) {
        failures.push(`removing ${probe.tenantId}: ${String(error)}`);
      }
    }

    // Verified rather than assumed, and on BOTH a `global` table and a tenant-owned one.
    // `tenant` alone is not enough: it carries no policy, so a DELETE against it succeeds
    // for the owner whatever happens elsewhere — while the tenant-owned deletes, if they
    // were ever issued under row-level security rather than as the owner, would match
    // nothing and leave every row in place with `tenant` reading clean.
    const ids = [PROBE_A.tenantId, PROBE_B.tenantId];
    const left = await owner().transaction(async (tx) => {
      const tenants = await tx.execute<{ id: string }>(
        sql`SELECT id FROM tenant WHERE id IN (${ids[0]}, ${ids[1]}) ORDER BY id`,
      );
      const rows = await tx.execute<{ tenant_id: string; n: string }>(
        sql`SELECT tenant_id, count(*)::text AS n FROM actuals_ledger_entry
             WHERE tenant_id IN (${ids[0]}, ${ids[1]}) GROUP BY tenant_id ORDER BY tenant_id`,
      );
      return { tenants: tenants.rows, rows: rows.rows };
    });
    if (left.tenants.length > 0) {
      failures.push(`tenant rows left: ${left.tenants.map((row) => row.id).join(', ')}`);
    }
    if (left.rows.length > 0) {
      failures.push(
        `actuals_ledger_entry rows left: ${left.rows
          .map((row) => `${row.tenant_id} (${row.n})`)
          .join(', ')}`,
      );
    }

    if (failures.length > 0) {
      throw new Error(
        'the harness did not clean up after itself, and `pnpm seed` will now refuse to run ' +
          `until it is done by hand:\n${failures.join('\n')}`,
      );
    }
  }, 120_000);

  describe('the relabelled probe Tenant is the same dataset', () => {
    it('reproduces the pinned golden figures from a probe Tenant', async () => {
      // Called directly rather than driven through the registry, because this assertion is
      // about typed FIGURES rather than about an opaque result graph. It goes through the
      // same use case the Review page calls, so the pages' figures are the ones pinned. The
      // numbers are the same ones `db-round-trip.test.ts` pins against the demo Tenant: if
      // the relabelling rewrote one entry of the vocabulary the domain interprets —
      // `opening_balance`, say, or a Mapping source — the computation would quietly mean
      // something else and these would move. Every isolation assertion in this file would
      // still pass, about the wrong data, which is why this one comes first.
      const result = await getProjectReview(
        restrictedDeps(),
        pmContextFor(PROBE_A.tenantId, PROBE_A.projectId),
        { projectId: PROBE_A.projectId },
      );
      if (!result.ok) throw new Error(`getProjectReview answered ${result.error.code}`);
      const { review } = result.value;
      expect(hours(review.evm.bacMh), 'BAC over the relabelled copy').toBe('2936.0');
      expect(hours(review.evm.acMh), 'AC over the relabelled copy').toBe('1661.5');
      expect(present(review.evm.spi).text, 'SPI over the relabelled copy').toBe('0.91');
      expect(review.measurementBasis).toBe('hours');
      // The Unplanned split as well as the headline three. BAC, AC and SPI are all
      // order-free sums that survive a surprising amount of damage: measured on
      // 2026-09-21, a writer that stamped the WRONG active Baseline sequence on the
      // probe's ledger — which reclassifies every mapped hour as Unplanned Work — left all
      // three unmoved. These are the figures that see it.
      const components = Object.fromEntries(
        review.unplanned.components.map((component) => [component.key, hours(component.mh)]),
      );
      expect(components, 'the Unplanned split over the relabelled copy').toEqual({
        unmapped: '166.0',
        'non-baselined': '0.0',
        'catch-all-overflow': '50.8',
      });
      expect(hours(review.unplanned.cumulative.unplannedMh)).toBe('216.8');
      // The numeric census sees the bigint figures, not only the counts: without this, a
      // census that skipped `bigint` would compare two lists of counts and call it faithful.
      const census = numberCensus(review);
      expect(census, 'the census carries BAC').toContain(2_936_000n);
      expect(census, 'the census carries AC').toContain(1_661_495n);
    });

    it('carries the demo Tenant alongside it, unchanged', async () => {
      // The probes are additions, not replacements. If creating them had disturbed the demo
      // Tenant — a collided primary key, a truncate, a reused Baseline sequence — the
      // figures the rest of the suite pins would move, and it would look like a domain bug.
      const result = await getProjectReview(
        restrictedDeps(),
        pmContextFor(DEMO_TENANT_ID, DEMO_PROJECT_ID),
        { projectId: DEMO_PROJECT_ID },
      );
      if (!result.ok) throw new Error(`getProjectReview answered ${result.error.code}`);
      const { review } = result.value;
      expect(hours(review.evm.bacMh)).toBe('2936.0');
      expect(hours(review.evm.acMh)).toBe('1661.5');
    });
  });

  describe.each(READS.map((entry) => [entry.name, entry] as const))(
    'read use case %s, against both probe Tenants as the restricted role',
    (_name, entry) => {
      const got = () => {
        const outcome = outcomes.get(entry.name);
        if (!outcome) throw new Error(`${entry.name} was never invoked — beforeAll did not run`);
        return outcome;
      };

      it('returns nothing of the other probe Tenant and nothing of the demo Tenant', () => {
        // The generic assertion, and the one that covers a field nobody has written yet: walk
        // the WHOLE result graph and look for the other Tenant's token. Four of the reads
        // behind this use case carry no WHERE clause at all, so row-level security is their
        // only filter. For two of the four — `actuals_ledger_entry` and `tracker_snapshot`,
        // whose rows are used as they arrive — `USING (true)` is reported here. For the other
        // two it is not, because the read surface re-filters them in memory; the table-level
        // assertion further down is what covers that, and the comment there says why.
        const underA = foreignStringsIn(required(entry, 'probe Tenant A', got().a), PROBE_B.token);
        expect(
          underA,
          `${entry.name} under probe Tenant A returned strings belonging to another Tenant:\n` +
            underA.join('\n'),
        ).toEqual([]);

        const underB = foreignStringsIn(required(entry, 'probe Tenant B', got().b), PROBE_A.token);
        expect(
          underB,
          `${entry.name} under probe Tenant B returned strings belonging to another Tenant:\n` +
            underB.join('\n'),
        ).toEqual([]);
      });

      it('returns nothing of either probe Tenant to the demo Tenant', () => {
        // The direction the probe-to-probe scan cannot cover. The demo Tenant is the seeded
        // one every other test file reads, and the probes are written beside it while this
        // suite runs — so "the harness's own fixtures do not leak into the product's data"
        // is worth asserting rather than assuming, and a policy that leaked one way would
        // usually leak both.
        const demo = required(entry, 'the demo Tenant', got().demo);
        for (const probe of [PROBE_A, PROBE_B]) {
          const leaked: string[] = [];
          walkStrings(demo, (value, path) => {
            if (value.includes(probe.token)) leaked.push(`${path} = ${JSON.stringify(value)}`);
          });
          expect(
            leaked,
            `${entry.name} under the demo Tenant returned strings belonging to ` +
              `${probe.tenantId}:\n${leaked.join('\n')}`,
          ).toEqual([]);
        }
      });

      it('returns the same data under either probe Tenant, as multisets', () => {
        // Completeness, half one. The two probes come from ONE builder, so after substituting
        // each Tenant's own token their results must be identical. A use case that silently
        // returned a subset under one Tenant fails here even though a "not empty" check would
        // pass. Arrays are compared as multisets: four of the reads carry no ORDER BY.
        const canonA = canonicalise(required(entry, 'probe Tenant A', got().a), PROBE_A.token, null);
        const canonB = canonicalise(required(entry, 'probe Tenant B', got().b), PROBE_B.token, null);
        expect(
          canonA,
          `${entry.name} returned different data under the two probe Tenants, which are ` +
            'relabelled copies of one another. Either one of them is missing rows, or one of ' +
            'them is carrying rows that are not its own.',
        ).toEqual(canonB);
      });

      it('computes exactly the same numbers over the relabelled copy', () => {
        // FAITHFULNESS, generically. The relabelling rewrites strings and nothing else, so
        // every number a probe Tenant's result carries must equal the demo Tenant's — not
        // only the three headline figures the spec pins, but every delta, every rate, every
        // per-Work-Package measure and every count. This is what makes a forgotten entry in
        // the relabeller's vocabulary loud: it is the assertion that caught `openingBalanceMh`
        // going to zero when `'opening_balance'` was rewritten, which BAC, AC and SPI did not
        // notice at all.
        const demoNumbers = numberCensus(required(entry, 'the demo Tenant', got().demo));
        for (const [probe, outcome] of [
          [PROBE_A, got().a],
          [PROBE_B, got().b],
        ] as const) {
          expect(
            numberCensus(required(entry, probe.tenantId, outcome)),
            `${entry.name} computed different numbers over ${probe.tenantId}'s relabelled copy ` +
              'than over the demo Tenant. The relabelling changed the meaning of the data, not ' +
              'just its names — check packages/db/src/probe-tenants.ts PRESERVED_VOCABULARY.',
          ).toEqual(demoNumbers);
        }
      });

      it('carries every fixture value the use case declares it must surface', () => {
        // The ABSOLUTE floor, and the only completeness assertion that does not compare one
        // result against another. Both of the comparisons below are relative, so a read that
        // lost the same field for EVERY Tenant — a select issued on the bare handle, which
        // returns nothing as the restricted role — is symmetric and passes them. This one
        // takes the values out of the fixture and requires them to come back.
        const requiredLabels = entry.mustSurface!(DEMO_STATE);
        for (const [probe, outcome] of [
          [PROBE_A, got().a],
          [PROBE_B, got().b],
        ] as const) {
          const present = new Set(
            decodedOriginalsIn(required(entry, probe.tenantId, outcome), probe.inverse),
          );
          const absent = requiredLabels.filter((label) => !present.has(label));
          expect(
            absent.slice(0, 20),
            `${entry.name} under ${probe.tenantId} did not return ${absent.length} of the ` +
              `${requiredLabels.length} fixture values ${REGISTRY_MODULE} says ` +
              'it must surface. Either the read lost them, or the declaration is wrong — and ' +
              'which one it is has to be decided, not assumed.',
          ).toEqual([]);
        }
      });

      it('carries every label the demo Tenant\'s own result carries', () => {
          // Completeness, half two — and the one that does not pass when BOTH probes return
          // nothing. Run the same use case against the seeded demo Tenant, take every string in
          // its result that the relabeller had a label for, and require the probe's result to
          // carry the relabelled counterpart of each. Mechanical: no hand-written row counts,
          // and it grows with the use case.
          const demoLabels = originalsIn(
            required(entry, 'the demo Tenant', got().demo),
            new Set(PROBE_A.labels.keys()),
          );
          const floor = entry.minimumLabels ?? DEFAULT_MINIMUM_LABELS;
          expect(demoLabels.length, `${entry.name} returned no labelled data at all`).toBeGreaterThan(
            floor,
          );

          for (const [probe, outcome] of [
            [PROBE_A, got().a],
            [PROBE_B, got().b],
          ] as const) {
            const decoded = decodedOriginalsIn(
              required(entry, probe.tenantId, outcome),
              probe.inverse,
            );
            const missing = demoLabels.filter((label) => !decoded.includes(label));
            const extra = decoded.filter((label) => !demoLabels.includes(label));
            expect(
              { missing: missing.slice(0, 20), extra: extra.slice(0, 20) },
              `${entry.name} under ${probe.tenantId} does not carry the same data as the demo ` +
                `Tenant's own result: ${missing.length} label(s) missing, ${extra.length} extra. ` +
                'A read that came back empty, or partially filtered, fails here.',
            ).toEqual({ missing: [], extra: [] });
          }
        });

      it('answers not_found, and nothing of A, when probe Tenant B asks for A\'s Project id', () => {
        // The leak that actually happens: an id that arrived in a URL, used under the wrong
        // Tenant. At repository level either a throw or an empty result was acceptable. At
        // use-case level the contract is exact: the error arm, with `not_found` — never a
        // throw, which the page would render as a crash, and never an `ok` carrying a default,
        // which would render as a Project with no data. `not_found` rather than any code that
        // says "it exists, but not for you", so existence is not disclosed.
        //
        // Tenant-wide reads (story 1.7's audit log) ignore projectId: they return the caller's
        // own Tenant's rows (`crossTenant: 'own-tenant-ok'`) and must still carry nothing of A.
        const { cross } = got();
        if (entry.crossTenant === 'own-tenant-ok') {
          expect(
            cross.error,
            `${entry.name} THREW on the cross-Tenant probe: ${String((cross.error as Error | undefined)?.message ?? cross.error)}`,
          ).toBeUndefined();
          expect(
            cross.refused,
            `${entry.name} refused the cross-Tenant probe — tenant-wide reads answer the ` +
              `caller's own Tenant, not not_found: ${cross.refused?.code ?? 'ok'}`,
          ).toBeUndefined();
          expect(cross.value, `${entry.name} returned no value on the cross-Tenant probe`).toBeDefined();
        } else {
          expect(
            cross.error,
            `${entry.name} THREW when probe Tenant B asked for A's Project id, instead of ` +
              `answering not_found: ${String((cross.error as Error | undefined)?.message ?? cross.error)}`,
          ).toBeUndefined();
          expect(
            cross.refused?.code,
            `${entry.name} did not answer not_found when probe Tenant B asked for A's Project id` +
              (cross.refused
                ? ` — it answered ${cross.refused.code}`
                : ' — it answered ok, so it turned an invisible Project into a value'),
          ).toBe('not_found');
        }

        // And the refusal / own-Tenant result itself carries nothing of A. The whole outcome is
        // walked, error arm included, so a use case that put the foreign row into `details` fails.
        const leaked = foreignStringsIn({ value: cross.value, refused: cross.refused }, PROBE_A.token);
        expect(
          leaked,
          `${entry.name} handed probe Tenant B data belonging to probe Tenant A when asked ` +
            `for A's Project id:\n${leaked.join('\n')}`,
        ).toEqual([]);
      });
      },
    );

    describe('every table a use case actually reads is isolated at the table level', () => {
      // WHY THIS EXISTS, AND IT WAS MEASURED RATHER THAN ANTICIPATED. The token scan above
      // asserts the strongest thing that matters — nothing of another Tenant reaches the
      // caller — but it cannot see an over-permissive policy on a table whose foreign rows
      // the read surface happens to discard in JavaScript afterwards.
      //
      // Four of `loadProjectBundle`'s selects carry no WHERE at all, and they divide in two.
      // `actuals_ledger_entry` and `tracker_snapshot` are used as they arrive, so setting
      // either policy to `USING (true)` failed six and nine assertions above. `baseline_wp`
      // and `rate_entry` are re-filtered in memory — by `baselineVersionSeq` and by
      // `resourceId`, both of which differ per Tenant — so `USING (true)` on either one
      // pulled every Tenant's rows into the process and ALL TWENTY assertions stayed green.
      // (`rls.test.ts`'s predicate assertion did catch it; this file did not, and the
      // acceptance criterion is about this file.)
      //
      // So the same claim is asserted one level down, driven by the set the query logger
      // MEASURED rather than by a list: for every table a use case was actually seen
      // reading, the restricted role inside `withTenant` must not be able to see a row
      // belonging to anybody else. A table that stops being read stops being checked here —
      // which is exactly what the reach assertion below turns into a decision.
      const reachedTenantOwned = () =>
        TENANT_OWNED.filter((owned) => reached.has(owned.table));

    it('shows neither probe Tenant a row belonging to anyone else, in any reached table', async () => {
      const tables = reachedTenantOwned();
      expect(
        tables.length,
        'no tenant-owned table was measured as read, so this assertion covers nothing',
      ).toBeGreaterThan(0);

      const leaks: string[] = [];
      for (const probe of [PROBE_A, PROBE_B]) {
        for (const owned of tables) {
          const seen = await withTenant(restricted!, probe.tenantId, (tx) =>
            tx.execute<{ n: number; other: string | null }>(
              sql`SELECT count(*)::int AS n, min(${sql.identifier(owned.tenantColumn!)}) AS other
                    FROM ${sql.identifier(owned.table)}
                   WHERE ${sql.identifier(owned.tenantColumn!)} <> ${probe.tenantId}`,
            ),
          );
          const row = seen.rows[0];
          const count = Number(row?.n ?? 0);
          if (count > 0) {
            leaks.push(
              `${owned.table}: ${probe.tenantId} can see ${count} row(s) belonging to ` +
                `${row?.other ?? 'another Tenant'}`,
            );
          }
        }
      }

      expect(
        leaks,
        'the restricted role can read another Tenant\'s rows from a table a read use case ' +
          'reaches:\n' +
          leaks.join('\n') +
          '\nThe result the use case returns may still look clean — `baseline_wp` and ' +
          '`rate_entry` are re-filtered in memory — but the rows crossed the boundary, and ' +
          'the next read of that table will not filter them.',
      ).toEqual([]);
    });
  });

  describe('what the harness does not reach', () => {
    it('measures the same unreached set the registry declares', () => {
      // Measured with a Drizzle query logger over the invocations above, not asserted from
      // the code. Both directions fail: a table that stops being read without being declared,
      // and a table declared unreached that a use case has started reading.
      const measured = TENANT_OWNED.map((owned) => owned.table)
        .filter((table) => !reached.has(table))
        .sort();
      const declared = UNREACHED_TENANT_OWNED_TABLES.map((entry) => entry.table).slice().sort();

      const newlyUnreached = measured.filter((table) => !declared.includes(table));
      const newlyReached = declared.filter((table) => !measured.includes(table));

      expect(
        { newlyUnreached, newlyReached },
        'the tenant-owned tables no read use case reaches have changed.\n' +
          `now unreached and undeclared: ${newlyUnreached.join(', ') || '(none)'} — this ` +
          'harness no longer covers them, so say so in ' +
          `${REGISTRY_MODULE} with a reason.\n` +
          `declared unreached but now read: ${newlyReached.join(', ') || '(none)'} — remove ` +
          'the entry; the harness covers them now.',
      ).toEqual({ newlyUnreached: [], newlyReached: [] });
    });

    it('reaches every other tenant-owned table', () => {
      const covered = TENANT_OWNED.map((owned) => owned.table).filter((table) =>
        reached.has(table),
      );
      // 16 tenant-owned tables, two declared unreached (story 1.4 slice 1 removed `app_user`;
      // the identity tables are `global`). A number here, so "the harness covers
      // every read use case" is a measurement rather than a claim.
      expect(covered.length).toBe(TENANT_OWNED.length - UNREACHED_TENANT_OWNED_TABLES.length);
    });
  });
});

afterAll(async () => {
  // Outside the suite above, because the reachability probe opens a pool even when the
  // database turns out to be unreachable as one of the two roles.
  await releaseSeedSuiteLock();
  await closeAllPools();
});
