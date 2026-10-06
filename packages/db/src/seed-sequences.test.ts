/**
 * `syncIdentitySequences` must only ever ADVANCE a shared identity counter.
 *
 * Epic 1 retrospective, finding F1's last symptom. `writeTenantRows` stamps fixture-relative
 * `seq` values with `OVERRIDING SYSTEM VALUE` and then resyncs each identity counter so the next
 * `default` insert lands past them. It did that with `setval(seq, MAX(seq))`, and `MAX(seq)` is
 * taken over the WHOLE table — which is shared by every Tenant, including the probe Tenants a
 * dozen suites create and destroy in parallel.
 *
 * So the resync could move a counter BACKWARDS. Suite A writes a probe in the 860,000,000 band
 * and the counter follows it up there. Suite B removes its own probe, and a `createProbeTenant`
 * running just after recomputes `MAX(seq)` over what is left — say the 700,000,000 band — and
 * sets the counter back down. The next ordinary `default` insert then re-issues a `seq` that a
 * surviving row already holds, and Postgres answers `duplicate key value violates unique
 * constraint "audit_log_pkey"`. That is the error a pristine `pnpm test` hit in two runs out of
 * four, in `org-writes` and `identity`, with nothing in either suite at fault.
 *
 * A sequence that only advances cannot do this, and advancing is what the function's own name
 * and docstring always claimed it did.
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { closeAllPools, getDb, getPool } from './client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  PROBE_SEQ_BAND_WIDTH,
  removeProbeTenant,
} from './probe-tenants';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from './seed-suite-lock';

const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const REQUIRE_DB = process.env.REQUIRE_DB === '1';

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

const reachable = await reachableAs(OWNER_DATABASE_URL);
if (REQUIRE_DB && !reachable) {
  throw new Error('REQUIRE_DB=1 but DATABASE_URL is not reachable as the owning role.');
}

/** Its own band, disjoint from every other suite's. */
const PROBE = buildProbeTenant('xtprobe-seqs', 890_000_000);
assertProbeTenantsDisjoint([PROBE]);

// Writes a probe Tenant, so it is a probe suite and holds the lock shared.
if (reachable) {
  await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');
}

async function asOwner<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: OWNER_DATABASE_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** The counter's current position, whatever rows the table happens to hold. */
async function sequencePosition(table: string): Promise<number> {
  return asOwner(async (client) => {
    const { rows } = await client.query<{ v: string | null }>(
      `SELECT pg_sequence_last_value(pg_get_serial_sequence($1, 'seq')::regclass)::text AS v`,
      [table],
    );
    return Number(rows[0]?.v ?? 0);
  });
}

afterAll(async () => {
  if (reachable) {
    await removeProbeTenant(getDb(OWNER_DATABASE_URL!), PROBE).catch(() => {});
  }
  await releaseSeedSuiteLock();
  await closeAllPools();
});

/**
 * Raises a counter to at least `floor`, and never touches it when it is already there.
 *
 * NOT a bare `setval(seq, floor)`. The counter is shared by every suite running beside this one,
 * so it may already sit ABOVE `floor` — the fence suites' probes alone carry it into the 961,000,000
 * band — and setting it to `floor` would then move it backwards, which is the very defect this
 * suite pins. It is guarded the same way `syncIdentitySequences` is, for the same reason.
 */
async function advanceSequenceTo(table: string, floor: number): Promise<void> {
  await asOwner((client) =>
    client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'seq'), $2, true) ` +
        `WHERE COALESCE(pg_sequence_last_value(pg_get_serial_sequence($1, 'seq')::regclass), 0) < $2`,
      [table, floor],
    ),
  );
}

describe.skipIf(!reachable)('identity-sequence resync only advances (retro F1)', () => {
  it('never moves a shared counter below where another Tenant already left it', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);

    // Stand the counter above everything this suite's probe will write, as a suite holding rows
    // in a higher band would have left it. The top of this suite's own band: nothing else writes
    // explicit seqs in [890M, 900M), so the default inserts every other suite makes from here on
    // land in a gap no probe band claims (see `RESERVED_SEQ` / `PROBE_SEQ_BAND_WIDTH`).
    const floor = PROBE.writeOptions.seqOffset + PROBE_SEQ_BAND_WIDTH;
    await advanceSequenceTo('audit_log', floor);

    // Read AFTER raising it: suites holding the seed-suite lock shared insert audit rows at this
    // very moment, so the position is `floor` or anywhere above it — never an exact value.
    const before = await sequencePosition('audit_log');
    expect(before).toBeGreaterThanOrEqual(floor);

    // Writing a probe in a LOWER band resyncs the counters. It must not drag this one down.
    await removeProbeTenant(owner, PROBE).catch(() => {});
    await createProbeTenant(owner, PROBE);

    expect(
      await sequencePosition('audit_log'),
      'the resync pulled the shared audit_log counter backwards — the next default insert will ' +
        'collide with a surviving row (audit_log_pkey)',
    ).toBeGreaterThanOrEqual(before);

    await removeProbeTenant(owner, PROBE);
  });
});
