/**
 * The probe Tenants the cross-tenant harness drives every read use case against.
 *
 * A probe Tenant is a COMPLETE RELABELLED COPY of the demo dataset: `buildDemoState()`
 * run through a consistent bijective string rewrite, written through the same row writer
 * `seed.ts` uses, and deleted again afterwards.
 *
 * WHY A RELABELLED COPY RATHER THAN A HAND-BUILT MINIMAL TENANT. Mapping each distinct
 * string to one distinct new string preserves every join and every equality the domain
 * performs, so the computation over the copy is identical — and the pinned golden figures
 * (2936.0 / 1661.5 / 0.91) are the proof that it is. That makes a forgotten vocabulary
 * entry a LOUD failure: relabel `'opening_balance'` and the Opening Balances stop being
 * recognised, so the figures move. A hand-written relabel list fails the other way: a
 * forgotten id makes one table quietly stop being observable while every isolation
 * assertion still passes, because there is nothing of that table left to leak.
 *
 * It is deliberately NOT re-exported from `packages/db/src/index.ts`, for the same reason
 * `seed.ts` is not: nothing in an application should be able to write Tenants by importing
 * a barrel. It is imported by `tests/cross-tenant.test.ts` and by nothing else. It stays
 * in this package when the harness moved out, because it writes through Drizzle.
 *
 * This module reads no environment and no clock. It takes its handle as an argument.
 */
import { stringify } from '@momo/domain';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { account, authUser, identityEvent, session, verification } from './schema';
import { tenantMembership } from './schema-membership';
import { DEMO_USERS } from './demo-identities';
import { buildDemoState } from './fixtures';
import { MAINTENANCE_SETTING, TABLE_REGISTRY } from './table-classes';
import { writeTenantRows } from './seed';
import { withTenant } from './with-tenant';
/**
 * The strings the relabeller must leave EXACTLY as they are.
 *
 * Everything here is vocabulary the domain or the adapters interpret rather than data a
 * Tenant owns: rewrite one and the computation changes meaning rather than merely changing
 * names. That is the whole risk surface of the relabelling approach, so the set is written
 * out in full and each group says which code reads it.
 *
 * Dates and ISO instants are excluded by shape rather than by membership — see
 * `isPreservedString` — because there are hundreds of them and they are all read the same
 * way (`projectDate`, `periodContains`, `effectiveFrom <= onDate`, working-day maths).
 */
export const PRESERVED_VOCABULARY = new Set([
    // packages/domain/src/types.ts — ProjectConfig.contractType
    '請負',
    '準委任',
    // packages/domain/src/types.ts — ProjectConfig.eacMethod
    'typical',
    // packages/domain/src/types.ts — LedgerEntryKind. `attribution.ts` branches on it.
    'opening_balance',
    'delta',
    // packages/domain/src/types.ts — MappingSource. `mapping.ts` branches on it ("manual wins").
    'manual',
    'rule',
    'disposition',
    'release',
    // packages/domain/src/types.ts — MappingRule.match.field. `evaluateRules` switches on it.
    'milestone',
    'category',
    'issueType',
    'parent',
    'keyPattern',
    // packages/domain/src/review.ts — DispositionKind.
    'map',
    'plan',
    'cr_candidate',
    'explain',
    // packages/domain/src/ledger.ts — the measurement basis, detected from the data.
    'hours',
    'count',
    // packages/db/src/schema.ts — connector.adapter. An adapter registry resolves it.
    'backlog',
    'fixture',
    'jira',
    // packages/domain/src/calendar.ts — HolidayKind, and the demo calendar's id.
    'jp',
    'vn',
    'jp-vn-2026',
]);
/** `YYYY-MM-DD`, the domain's `IsoDate`. Compared with `<=` against other dates. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An ISO-8601 instant. Parsed into a `Date` by the writer and by `projectDate`. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
/** True when a string must survive the rewrite untouched. */
export function isPreservedString(value) {
    return (value === '' ||
        PRESERVED_VOCABULARY.has(value) ||
        ISO_DATE.test(value) ||
        ISO_INSTANT.test(value));
}
/**
 * Collects every distinct string VALUE in a structure, in a deterministic order.
 *
 * Object KEYS are not collected and are never rewritten: they are field names the domain
 * reads (`wpId`, `deltaMh`), not Tenant data. The one place keys carry data is the
 * holiday calendar, whose keys are dates — which the rewrite would preserve anyway.
 */
function collectStrings(value, into) {
    if (typeof value === 'string') {
        into.add(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            collectStrings(item, into);
        return;
    }
    if (value !== null && typeof value === 'object') {
        assertPlainObject(value, 'collectStrings');
        for (const item of Object.values(value))
            collectStrings(item, into);
    }
}
/**
 * Refuses anything `Object.entries` would silently flatten.
 *
 * `Object.fromEntries(Object.entries(new Map(...)))` is `{}`, and the same is true of a
 * `Set` and (as far as its data goes) a `Date`. `buildDemoState()` returns plain objects,
 * arrays and primitives today, so the walks below are correct — but the `as DemoState`
 * cast at the end of the rewrite would hide it the day one of those appears, and BOTH
 * probes would lose the field identically, so neither the A/B symmetry comparison nor the
 * comparison against the demo Tenant could name it. Losing a field silently is the one
 * outcome a relabelled copy must not have, so the walk refuses instead of guessing.
 */
function assertPlainObject(value, where) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null)
        return;
    throw new Error(`${where} met a ${value.constructor?.name ?? 'non-plain'} in the demo state, and it ` +
        'walks plain objects and arrays only — Object.entries flattens a Map, a Set or a Date ' +
        'to nothing, so the relabelled copy would quietly lose that field for every probe ' +
        'Tenant at once. Teach both walks how to carry it before putting one in the fixture.');
}
/** Rewrites every string value through `rewrite`, leaving shape and keys untouched. */
function mapStrings(value, rewrite) {
    if (typeof value === 'string')
        return rewrite(value);
    if (Array.isArray(value))
        return value.map((item) => mapStrings(item, rewrite));
    if (value !== null && typeof value === 'object') {
        assertPlainObject(value, 'mapStrings');
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, rewrite)]));
    }
    return value;
}
/**
 * Builds one probe Tenant's relabelled state. Pure: no database, no clock, no environment.
 *
 * The rewrite maps each distinct relabellable string to `${token}-${n}`, where `n` is its
 * position in the sorted list of those strings. Three properties come out of that:
 *
 *   * it is BIJECTIVE by construction (distinct index per distinct string), so every join
 *     and every equality the domain performs survives;
 *   * it is OPAQUE — no relabelled value contains any part of the original — so the
 *     harness's scan for the demo Tenant's markers cannot false-positive on a probe's own
 *     data, which a prefixing scheme (`token + original`) would guarantee it did;
 *   * it is ORDER-PRESERVING with respect to the sorted originals, so the one text ordering
 *     in the read surface (`ORDER BY wbs_code`) keeps a stable, reproducible shape.
 *
 * @param token a short marker unique to this probe Tenant. Asserted absent from the
 *   fixture, because a token that already occurred in the demo data would make the
 *   harness's central assertion — "no string carries the other Tenant's token" — report
 *   leaks that are not leaks, or miss ones that are.
 * @param seqOffset the band this Tenant's fixture-relative `seq` values come from. See
 *   `TenantRowWriteOptions.seqOffset`; the bands must not overlap each other, the demo's,
 *   or `rls.test.ts`'s probe.
 */
/** Quotes a value for a diagnostic without the storage codec, which refuses non-JSON input. */
const quote = (value) => typeof value === 'string' ? stringify(value) : String(value);
export function buildProbeTenant(token, seqOffset) {
    const demo = buildDemoState();
    const distinct = new Set();
    collectStrings(demo, distinct);
    for (const original of distinct) {
        if (original.includes(token)) {
            throw new Error(`the probe token ${quote(token)} already occurs in the demo fixture, in ` +
                `${quote(original)}. The harness asserts that a foreign token never ` +
                'appears in a result, so a token the fixture already carries makes that assertion ' +
                'meaningless. Choose another.');
        }
    }
    const relabellable = [...distinct].filter((value) => !isPreservedString(value)).sort();
    const labels = new Map();
    const inverse = new Map();
    relabellable.forEach((original, index) => {
        const relabelled = `${token}-${String(index).padStart(6, '0')}`;
        labels.set(original, relabelled);
        inverse.set(relabelled, original);
    });
    // Bijectivity, asserted rather than argued. Index collisions are impossible by
    // construction; this is what catches a future change to the label format that is not.
    if (inverse.size !== labels.size) {
        throw new Error(`the relabelling is not bijective: ${labels.size} originals collapsed onto ` +
            `${inverse.size} labels. A non-injective rewrite merges two Tickets, two Work ` +
            'Packages or two Resources, and every figure computed over the copy is then wrong ' +
            'in a way no assertion below would name.');
    }
    const state = mapStrings(demo, (value) => labels.get(value) ?? value);
    return {
        token,
        tenantId: state.fixture.tenant.id,
        projectId: state.fixture.project.id,
        state,
        labels,
        inverse,
        writeOptions: { idPrefix: `${token}-`, seqOffset },
    };
}
/**
 * The demo Tenant's own strings, as markers to scan a probe's results for.
 *
 * The demo Tenant carries no token — it is the real seeded data — so "nothing of the demo
 * Tenant came back" cannot be asserted the way the cross-probe direction is. These are its
 * identifying values instead: who it is, what it works on, and the Tickets and Work
 * Packages a leak would actually carry.
 *
 * Short markers are dropped. A two- or three-character marker would match inside an
 * unrelated domain label ("Mapped to baselined WPs") and report a leak that is not one;
 * every id and name in the fixture is comfortably longer than the cut.
 */
export function demoMarkers(demo = buildDemoState()) {
    const f = demo.fixture;
    const raw = [
        f.tenant.id,
        f.tenant.name,
        f.department.id,
        f.department.name,
        f.program.id,
        f.program.name,
        f.project.id,
        f.project.name,
        f.project.clientName,
        f.unlinkedAccount,
        f.baseline.id,
        f.baseline.reason,
        ...f.resources.flatMap((r) => [r.id, r.name, r.accountId]),
        ...f.wps.flatMap((w) => [w.id, w.name]),
        ...f.mappingRules.flatMap((r) => [r.id, r.name, r.match.value]),
        ...demo.snapshots.map((snap) => snap.snapshotId),
        // Every Snapshot's Tickets, not only the pinned one's. The Snapshot ids above already
        // come from all six, and a leak does not restrict itself to the rows a use case would
        // have chosen — `ticket_observation` is one of the five tables read with no WHERE at
        // all, so a foreign row from any Snapshot can surface.
        ...demo.snapshots.flatMap((snap) => snap.tickets.flatMap((t) => [t.trackerIssueId, t.key, t.title])),
    ];
    const markers = [...new Set(raw)].filter((marker) => marker.length >= 4);
    if (markers.length === 0) {
        // The harness builds a single alternation out of these, and `new RegExp('')` matches
        // EVERY string — so an empty marker set would turn the demo half of the isolation scan
        // from "finds nothing" into "reports everything", which is just as useless and looks
        // like a broken harness rather than a missing one.
        throw new Error('the demo Tenant has no markers to scan a probe result for. Half the isolation scan ' +
            'would then assert nothing at all. Check that `buildDemoState()` still returns the ' +
            'fixture, and that the length cut in `demoMarkers` has not been raised past it.');
    }
    return markers;
}
/**
 * The `seq` values other code already owns, and the width each probe Tenant claims.
 *
 * `actuals_ledger_entry.seq` and `mapping_event.seq` are GLOBAL primary keys the caller
 * allocates, so every writer of a second Tenant has to pick a band nothing else is using.
 * The demo seed writes 1..184 from the fixture, and `rls.test.ts` puts its one probe ledger
 * row at 9_000_001 — and vitest runs the two files in parallel, so an overlap is a
 * duplicate-key error in whichever file loses the race, which reads as a flake.
 */
export const RESERVED_SEQ = {
    /** The demo seed's highest fixture-derived seq, with room to spare. */
    demoCeiling: 1_000_000,
    /** `rls.test.ts`'s probe ledger row. */
    rlsProbe: 9_000_001,
};
/** How many seq values one probe Tenant may use. The fixture needs 184. */
export const PROBE_SEQ_BAND_WIDTH = 1_000_000;
/**
 * Refuses a set of probe Tenants that could interfere with each other or with the demo.
 *
 * Called where the probes are built, so a future edit fails BY NAME at module load rather
 * than as a duplicate-key error inside `beforeAll`, or — worse, for the tokens — as an
 * isolation assertion that quietly cannot distinguish one Tenant from the other.
 */
export function assertProbeTenantsDisjoint(probes) {
    for (const probe of probes) {
        const { seqOffset } = probe.writeOptions;
        if (seqOffset <= RESERVED_SEQ.demoCeiling) {
            throw new Error(`probe Tenant ${probe.token} allocates seq from ${seqOffset}, which is inside the ` +
                `band the demo seed writes (up to ${RESERVED_SEQ.demoCeiling}).`);
        }
        if (RESERVED_SEQ.rlsProbe >= seqOffset &&
            RESERVED_SEQ.rlsProbe < seqOffset + PROBE_SEQ_BAND_WIDTH) {
            throw new Error(`probe Tenant ${probe.token}'s seq band [${seqOffset}, ` +
                `${seqOffset + PROBE_SEQ_BAND_WIDTH}) contains ${RESERVED_SEQ.rlsProbe}, which ` +
                'packages/db/src/rls.test.ts writes — and vitest runs the two files in parallel.');
        }
    }
    for (const [index, probe] of probes.entries()) {
        for (const other of probes.slice(index + 1)) {
            // Substring, not equality: the isolation scan asks whether a string CONTAINS the
            // other Tenant's token, so `x` inside `xy` would report every one of xy's own
            // strings as a leak of x, and hide every real leak of x among the noise.
            if (probe.token.includes(other.token) || other.token.includes(probe.token)) {
                throw new Error(`probe tokens ${probe.token} and ${other.token} overlap as substrings. The ` +
                    'isolation scan tests for containment, so neither Tenant could be told apart ' +
                    'from the other.');
            }
            const a = probe.writeOptions.seqOffset;
            const b = other.writeOptions.seqOffset;
            if (Math.abs(a - b) < PROBE_SEQ_BAND_WIDTH) {
                throw new Error(`probe Tenants ${probe.token} and ${other.token} allocate seq from overlapping ` +
                    `bands (${a} and ${b}, width ${PROBE_SEQ_BAND_WIDTH}). They share the global ` +
                    'primary keys of actuals_ledger_entry and mapping_event.');
            }
        }
    }
}
/**
 * Writes one probe Tenant, after removing any remains of a previous run.
 *
 * @param owner the OWNING role's handle. The `tenant` row is `global` — the application
 *   role holds SELECT there and nothing else — and the probe's rows must exist OUTSIDE the
 *   application role's reach for "the other Tenant cannot see them" to mean anything.
 */
export async function createProbeTenant(owner, probe) {
    await removeProbeTenant(owner, probe);
    await withTenant(owner, probe.tenantId, (tx) => writeTenantRows(tx, probe.state, probe.writeOptions));
}
/**
 * Deletes every row belonging to `tenantId`, in reverse registry order.
 *
 * Scoped to this Tenant's own id, never a bare `DELETE`: the demo Tenant's rows are in the
 * same tables, `rls.test.ts` has a probe Tenant of its own in them at the same time, and a
 * gate that can destroy the fixture it is checking is not a gate.
 *
 * The append-only tables refuse DELETE to everybody, the owner included, so this opens the
 * maintenance hatch — the same sanctioned path `seed.ts` uses for its TRUNCATE — rather
 * than relying on the local owner happening to be a superuser.
 *
 * Idempotent, and safe to call for a Tenant that was never written.
 */
export async function removeProbeTenant(owner, probe) {
    await removeTenant(owner, probe.tenantId, probeMemberIds(probe));
}
/**
 * Deletes every row belonging to `tenantId` — the same teardown as `removeProbeTenant`, for a
 * suite that writes a hand-built Tenant of its own rather than a relabelled probe copy.
 *
 * Such a suite MUST call this before it releases the seed-suite lock: a Tenant left behind is
 * one more row in `tenant`, and the next `pnpm test` against the same database then fails the
 * seed orchestration's "Refusing to seed: this database holds N Tenants" guard. CI never sees
 * it because CI starts from a fresh database.
 *
 * @param knownUserIds members that may no longer have a membership row to be found by (see
 *   `probeMemberIds`). A suite that writes no people passes nothing.
 */
export async function removeTenant(owner, tenantId, knownUserIds = []) {
    await owner.transaction(async (tx) => {
        await tx.execute(sql `SELECT set_config(${MAINTENANCE_SETTING}, 'on', true)`);
        await deleteTenantMembers(tx, tenantId, knownUserIds);
        await deleteTenantRows(tx, tenantId);
    });
}
/**
 * The user ids `writeTenantRows` gave a probe Tenant's members — one per `DEMO_USERS` entry,
 * prefixed by the probe's `idPrefix`. Known without reading the bridge, which is the point: a
 * member whose membership was REVOKED (story 1.4 slice 2) has no row left to be found by.
 */
export function probeMemberIds(probe) {
    return Object.values(DEMO_USERS).map((user) => `${probe.writeOptions.idPrefix}${user.id}`);
}
/**
 * Deletes the probe Tenant's PEOPLE (story 1.4 slice 1): its memberships by Tenant id, and the
 * users those memberships name — with their sessions and credential accounts — by user id,
 * together with the probe's KNOWN member ids (`probeMemberIds`), because a revoked member
 * (slice 2) is named by no membership any more.
 *
 * The identity tables and the membership bridge are `global` (no tenant column), so the
 * registry walk below skips them by design; without this a probe's users would outlive it and
 * the next run would collide on their emails. Users are found through the Tenant's memberships
 * before those are deleted, in the same transaction, so a crash leaves both or neither.
 */
async function deleteTenantMembers(tx, tenantId, knownUserIds) {
    const members = await tx
        .select({ userId: tenantMembership.userId })
        .from(tenantMembership)
        .where(eq(tenantMembership.tenantId, tenantId));
    const userIds = [...new Set([...knownUserIds, ...members.map((row) => row.userId)])];
    if (userIds.length > 0) {
        // Every `global` table that names a user, not only the three Better Auth ones. The registry
        // walk in `deleteTenantRows` skips a table whose `tenantColumn` is null on the stated ground
        // that it "holds nothing a probe Tenant wrote", and story 1.4 made that untrue: a probe member
        // who completes a password reset leaves an `identity_event` row, and one who requests a reset
        // leaves a `reset-password:` row in `verification`. Both name a user this function is about to
        // delete, and the application role holds no DELETE on `identity_event` with which to correct
        // the leak afterwards. Only the reset rows are taken from `verification`: an OAuth state row
        // keeps JSON in `value`, not a user id, so it is not this Tenant's to remove.
        await tx.delete(identityEvent).where(inArray(identityEvent.userId, userIds));
        await tx
            .delete(verification)
            .where(and(inArray(verification.value, userIds), like(verification.identifier, 'reset-password:%')));
        await tx.delete(session).where(inArray(session.userId, userIds));
        await tx.delete(account).where(inArray(account.userId, userIds));
        await tx.delete(authUser).where(inArray(authUser.id, userIds));
    }
    await tx.delete(tenantMembership).where(eq(tenantMembership.tenantId, tenantId));
}
async function deleteTenantRows(tx, tenantId) {
    // Reverse registry order. The registry documents itself as being in dependency order,
    // and reading it here is one list fewer than writing a second one — `seed.ts`'s
    // TRUNCATE_ORDER is already recorded in deferred-work as duplication worth removing.
    for (const entry of [...TABLE_REGISTRY].reverse()) {
        // `tenant` is the table `tenant_id` points at, so it is discriminated by its own id.
        // Everything else with no tenant column is SKIPPED rather than guessed at: a future
        // `global` or `operational` table without an `id` column would raise 42703 and abort
        // the cleanup half-finished, leaving probe rows behind in the tables already passed.
        // Such a table holds nothing a probe Tenant wrote, so there is nothing to delete.
        const column = entry.tenantColumn ?? (entry.table === 'tenant' ? 'id' : null);
        if (column === null)
            continue;
        await tx.execute(sql `DELETE FROM ${sql.identifier(entry.table)} WHERE ${sql.identifier(column)} = ${tenantId}`);
    }
}
