import { describe, expect, it } from 'vitest';
import { isAuditAction, type AuditDeclaration, type AuditEntry } from '../packages/app/src/audit';
import type { MembershipWriteRepository } from '../packages/app/src/ports/membership-write';
import type { OrgRepository } from '../packages/app/src/ports/org-write';
import type { ProjectWriteRepository } from '../packages/app/src/ports/project-write';
import type { ResourceWriteRepository } from '../packages/app/src/ports/resource-write';
import type { WriteDeps, WriteScope } from '../packages/app/src/ports/write-deps';
import { USE_CASE_AUDIT } from '../packages/app/src/use-cases/audit-declarations';
import { MEMBERSHIP_WRITE_AUDIT } from '../packages/app/src/use-cases/membership-writes';
import { ORG_WRITE_AUDIT } from '../packages/app/src/use-cases/org-writes';
import { PROJECT_WRITE_AUDIT } from '../packages/app/src/use-cases/project-writes';
import { RESOURCE_WRITE_AUDIT } from '../packages/app/src/use-cases/resource-writes';
import { CONNECTOR_WRITE_AUDIT } from '../packages/app/src/use-cases/connector-writes';
import type { CredentialsCryptoPort } from '../packages/app/src/ports/credentials-crypto';
import {
  READ_SURFACE_MODULE,
  READ_USE_CASES,
  REGISTRY_MODULE,
  readSurfaceFunctionNames,
  type InvokeWrite,
  type ReadUseCase,
  type WriteTarget,
} from './read-use-cases';
import {
  readScheduleCalendarWriteFunctionNames,
  SCHEDULE_CALENDAR_WRITE_MODULES,
} from './schedule-calendar-writes';

/**
 * THE AUDIT GATE (AD-14, AR-26 — story 1.3 slice 1; generalised by slice 2). Pure: no database,
 * no environment.
 *
 * "An audited use case that commits without its record is impossible to ship unnoticed." Two
 * halves, both enumerated MECHANICALLY off the use-case surface (like the cross-tenant harness),
 * so a use case is covered the day it is exported:
 *
 *   1. CLASSIFIED. Every export of `packages/app/src/use-cases/index.ts` is either a registered
 *      read or declared in `USE_CASE_AUDIT` (`packages/app/src/use-cases/audit-declarations.ts`)
 *      as audited — with the actions it records — or unaudited with a reason. A new write that is
 *      neither fails here, named. The same classification covers the schedule/calendar write
 *      modules via a second enumerated list (Epic 2 retro F10 / Q1→B) — those writers stay off
 *      the use-cases barrel and off this gate's Epic 1 write registry.
 *   2. DRIVEN. Every declared use case ON THE USE-CASES SURFACE is run, through its registry
 *      entry's `invokeWrite` and each of its `moreWrites`, against a FAKE tenant transaction that
 *      commits what its work did when the work resolves and discards it when the work throws —
 *      the contract `packages/db`'s `inTenantTransaction` keeps with Postgres. An audited one must
 *      open exactly one transaction and commit exactly one record, of a declared action, on that
 *      transaction's own scope, per invocation — and between its invocations record every action
 *      it declares; when any repository write throws, or the transaction fails after the work, it
 *      must commit none. An unaudited one must commit none, ever. Schedule/calendar writers are
 *      classified only (Q1→B); their runtime audit is covered by fence/calendar tests.
 *
 * NOT TIED TO ONE SCOPE (slice 2, resolving slice 1's B5). The fake transaction hands the WHOLE
 * `WriteScope` — one fake per repository family (`FAKE_FAMILIES`), each recording its write
 * members and answering its reads from one small consistent world — and the deps are the whole
 * `WriteDeps`, the Clock and the id port included. A new repository family adds its fake below;
 * the `WriteScope` type makes leaving it out a compile error.
 *
 * What this catches, each watched to fail: a write that skips `audit.record`; `audit.record`
 * made on a second transaction (it would commit although the change rolled back, or open two);
 * an action outside the enum forced past the type; a new write exported unclassified; a branch
 * that records nothing while the branch the registry drives records. What the fake cannot prove —
 * that Postgres really rolls the record back with the change — is the write harness's
 * (`tests/cross-tenant-writes.test.ts`), against real row-level security.
 */

const USE_CASE_AUDIT_MODULE = 'packages/app/src/use-cases/audit-declarations.ts';

const HANDLE = { marker: 'fake-handle' };
/** The gate's signed-in user; every record's actor must be derived from it (story 1.4). */
const GATE_USER = 'audit-gate';
const ACTOR = `user:${GATE_USER}`;
/** The Project anchor the project writes stamp with. */
const AT = new Date('2026-09-01T00:00:00Z');
/** The Clock the organisation writes stamp with — distinct, so a mix-up shows. */
const NOW = new Date('2026-09-02T03:04:05Z');

/**
 * The fake world, one of each org unit, consistent: the Project sits in the Department and its
 * Program. The target names them, so every write the registry drives can succeed.
 */
const WORLD = {
  department: { id: 'dep-gate', name: 'Gate Department' },
  program: { id: 'prg-gate', departmentId: 'dep-gate', name: 'Gate Program' },
  project: { id: 'prj-gate', name: 'Gate Project', departmentId: 'dep-gate', programId: 'prg-gate' },
  /**
   * The Tenant's memberships (story 1.4 slice 2): the gate's own user and a second Tenant Admin —
   * two, so no membership write the registry drives meets the last-admin rule — and the PM the
   * writes change, holding a stale Project id (one whose Project does not exist) and not the
   * Project, so every registered input changes something.
   */
  members: [
    { userId: GATE_USER, role: 'tenant_admin', projectIds: [] },
    { userId: 'usr-gate-admin-2', role: 'tenant_admin', projectIds: [] },
    { userId: 'usr-gate-pm', role: 'pm', projectIds: ['prj-gate-gone'] },
  ],
} as const;

const TARGET: WriteTarget = {
  tenantId: 'ten-gate',
  userId: GATE_USER,
  projectId: WORLD.project.id,
  ticketIds: ['tkt-gate-1', 'tkt-gate-2'],
  wpId: 'wp-gate',
  departmentId: WORLD.department.id,
  programId: WORLD.program.id,
  memberUserId: 'usr-gate-pm',
  staleProjectId: 'prj-gate-gone',
  secondAdminUserId: 'usr-gate-admin-2',
  resourceId: 'res-gate',
  connectorId: 'con-gate',
};

interface Committed {
  /** The index of the transaction the record was appended in. */
  readonly transaction: number;
  readonly entry: AuditEntry;
}

interface Change {
  readonly transaction: number;
  /** `family.member`, e.g. `org.insertProgram`. */
  readonly member: string;
}

interface Run {
  readonly transactions: number;
  /** Repository writes that committed, with their transaction's index. */
  readonly changes: readonly Change[];
  readonly records: readonly Committed[];
  readonly error?: unknown;
  readonly returned?: unknown;
}

interface Sabotage {
  /** A repository WRITE member throws after recording its call. */
  readonly memberThrows?: boolean;
  /** The transaction fails after its work resolved, before commit. */
  readonly failAfterWork?: boolean;
}

/** Records one write member's call, then lands `landed` — or throws, under sabotage. */
type Recorder = <Landed>(member: string, landed: Landed) => () => Promise<Landed>;

/**
 * One fake per repository family. Write members record through `write`; reads answer from WORLD
 * and record nothing (reading is not a change).
 */
const FAKE_FAMILIES: {
  readonly [Family in Exclude<keyof WriteScope, 'audit' | 'bound'>]: (
    write: Recorder,
  ) => WriteScope[Family];
} = {
  projectWrite: (write): ProjectWriteRepository => ({
    projectAnchor: async () => AT,
    workPackageInProject: async () => true,
    recordMapDisposition: write('projectWrite.recordMapDisposition', undefined),
    recordPlanDisposition: write('projectWrite.recordPlanDisposition', { wpId: 'wp-new-gate' }),
    recordExplainDisposition: write('projectWrite.recordExplainDisposition', undefined),
    recordChangeRequestCandidates: write('projectWrite.recordChangeRequestCandidates', undefined),
    recordManualMapping: write('projectWrite.recordManualMapping', undefined),
  }),
  org: (write): OrgRepository => ({
    findDepartment: async (id) => (id === WORLD.department.id ? WORLD.department : null),
    findProgram: async (id) => (id === WORLD.program.id ? WORLD.program : null),
    findProject: async (id) => (id === WORLD.project.id ? WORLD.project : null),
    insertDepartment: write('org.insertDepartment', undefined),
    renameDepartment: write('org.renameDepartment', undefined),
    insertProgram: write('org.insertProgram', undefined),
    renameProgram: write('org.renameProgram', undefined),
    insertProject: write('org.insertProject', undefined),
    renameProject: write('org.renameProject', undefined),
    setProjectProgram: write('org.setProjectProgram', undefined),
    setProjectDepartment: write('org.setProjectDepartment', undefined),
  }),
  // The bridge's writer: `lockMembers` answers what the real statement would — the admins plus the
  // caller and the target, ordered by user id — and records nothing (a lock is not a change).
  membership: (write): MembershipWriteRepository => ({
    lockMembers: async ({ callerId, targetId }) =>
      WORLD.members
        .filter((row) => row.role === 'tenant_admin' || row.userId === callerId || row.userId === targetId)
        .slice()
        .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)),
    deleteMembership: write('membership.deleteMembership', undefined),
    setRole: write('membership.setRole', undefined),
    setProjectIds: write('membership.setProjectIds', undefined),
  }),
  resources: (write): ResourceWriteRepository => ({
    findDepartment: async (id) => (id === WORLD.department.id ? { id } : null),
    findResource: async (id) =>
      id === 'res-gate'
        ? { id, departmentId: WORLD.department.id, name: 'Gate Resource', role: 'Engineer' }
        : null,
    findProject: async (id) => (id === WORLD.project.id ? { id } : null),
    findTrackerAccount: async (id) =>
      id === 'ta-gate' ? { id: 'ta-gate', accountId: 'acct-gate' } : null,
    insertResource: write('resources.insertResource', undefined),
    appendResourceRate: write('resources.appendResourceRate', undefined),
    appendProjectDefaultRate: write('resources.appendProjectDefaultRate', undefined),
    appendTrackerAccountLink: write('resources.appendTrackerAccountLink', 1),
  }),
  connectorWrite: (write) => ({
    projectAnchor: async () => AT,
    findConnector: async (id) =>
      id === 'con-gate'
        ? {
            id: 'con-gate',
            projectId: WORLD.project.id,
            adapter: 'backlog',
            site: 'example.backlog.jp',
            scope: 'EC2',
            spaceLabel: 'example.backlog.jp',
            approvalRecordedAt: AT,
            approvalName: 'fixture',
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorAt: null,
            hasCredentials: true,
            searchLimit: 150,
          }
        : null,
    findConnectorForProject: async (projectId) =>
      projectId === WORLD.project.id ? null : null, // allow addConnector on the gate Project
    listConnectors: async () => [],
    insertConnector: write('connectorWrite.insertConnector', undefined),
    rotateCredentials: write('connectorWrite.rotateCredentials', undefined),
    updateScope: write('connectorWrite.updateScope', undefined),
    appendScopeEvent: write('connectorWrite.appendScopeEvent', 1),
    latestScopeSeq: async () => 1,
    appendBasisEvent: write('connectorWrite.appendBasisEvent', 1),
    latestBasis: async () => null,
    appendSettingEvent: write('connectorWrite.appendSettingEvent', 1),
    latestSetting: async () => ({ seq: 1, resolvedStatusIds: ['Closed'] }),
    appendSnapshotAttempt: write('connectorWrite.appendSnapshotAttempt', undefined),
    listSnapshotAttempts: async () => [],
    latestAttemptAt: async () => null,
    latestSnapshot: async () => null,
    latestSnapshotForProject: async () => null,
    setLastError: write('connectorWrite.setLastError', undefined),
    countMappingEventsForProject: async () => 0,
    loadEncryptedCredentials: async () => null,
    listOpenOverlaps: async () => [],
    listLeftScopeTickets: async () => [],
    confirmOwnership: async () => {},
  }),
  ingestWrite: (write) => ({
    writeIngestSnapshot: write('ingestWrite.writeIngestSnapshot', {
      kind: 'written' as const,
      snapshotId: 'snap-gate',
    }),
  }),
};

/** Drives one invocation against a fresh fake transaction. */
async function drive(invoke: InvokeWrite, sabotage: Sabotage = {}): Promise<Run> {
  let transactions = 0;
  let issued = 0;
  const changes: Change[] = [];
  const records: Committed[] = [];

  const deps: WriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    clock: { now: () => NOW },
    ids: { next: () => `id-gate-${(issued += 1)}` },
    transaction: async (_handle, _tenantId, work) => {
      const index = transactions;
      transactions += 1;
      const pendingChanges: Change[] = [];
      const pendingRecords: Committed[] = [];
      const write: Recorder = (member, landed) => async () => {
        pendingChanges.push({ transaction: index, member });
        if (sabotage.memberThrows) throw new Error(`gate: ${member} failed`);
        return landed;
      };
      const scope: WriteScope = {
        projectWrite: FAKE_FAMILIES.projectWrite(write),
        org: FAKE_FAMILIES.org(write),
        membership: FAKE_FAMILIES.membership(write),
        resources: FAKE_FAMILIES.resources(write),
        connectorWrite: FAKE_FAMILIES.connectorWrite(write),
        ingestWrite: FAKE_FAMILIES.ingestWrite(write),
        bound: { tx: { marker: 'fake-tx' }, tenantId: 'ten-gate' },
        audit: {
          append: async (auditEntry) => {
            pendingRecords.push({ transaction: index, entry: auditEntry });
          },
        },
      };
      const result = await work(scope);
      if (sabotage.failAfterWork) throw new Error('gate: the transaction failed after the work');
      changes.push(...pendingChanges);
      records.push(...pendingRecords);
      return result;
    },
  };

  try {
    const returned = await invoke(deps, TARGET);
    return { transactions, changes, records, returned };
  } catch (error) {
    return { transactions, changes, records, error };
  }
}

/** Every input the gate drives for one entry: `invokeWrite`, then each of `moreWrites`. */
function invocationsOf(entry: ReadUseCase): readonly InvokeWrite[] {
  return [entry.invokeWrite!, ...(entry.moreWrites ?? [])];
}

const READ_NAMES = new Set(
  READ_USE_CASES.filter((entry) => entry.kind === 'read').map((entry) => entry.name),
);

/**
 * THE USE CASES THIS GATE ACCEPTS AS UNAUDITED — named here, not only in their own module.
 *
 * Epic 1 retrospective, deferred-work audit finding A2. `{ unaudited: "reason" }` is a use case's
 * own declaration, and the gate checked it against nothing: a write that should be on NFR-A1's
 * list could exempt itself in the file that implements it, with a sentence nobody had to agree
 * with. The entry recording that judged it safe "because nothing is declared unaudited" — and
 * `changeTenantCurrency` now declares exactly that, so the cover was gone.
 *
 * Exempting a write is now a TWO-KEY decision: the module declares it, and this list — read by
 * whoever reviews the gate, not by whoever writes the use case — agrees. The list is exact in
 * both directions: a use case declaring `unaudited` and absent here fails, and an entry here
 * whose use case no longer declares `unaudited` fails as stale.
 *
 * This does not make the gate check NFR-A1's seventeen action groups; that list is prose in the
 * PRD and matching it mechanically is its own piece of work (still open in `deferred-work.md`).
 * What it does is stop a use case exempting itself unilaterally.
 */
const UNAUDITED_BY_DECISION: Readonly<Record<string, string>> = {
  changeTenantCurrency:
    'R0 accepts only JPY, so the success path changes no reported figure, and the refusal writes ' +
    'nothing. Revisit the moment a second currency is accepted — at which point a currency change ' +
    'moves every money figure in the Tenant and is squarely on NFR-A1\'s list.',
  compareBaselineVersions:
    'Story 4.4 read-only Baseline plan compare — loads two pins and diffs; no INSERT/UPDATE/DELETE.',
  reDerivePinnedBaseline:
    'Story 4.2 read-only pin re-derive — loads pinned run (+ prev inputs) and codec-compares; no rows written.',
};

const DECLARED: readonly (readonly [string, AuditDeclaration])[] = Object.entries(USE_CASE_AUDIT);

/** Schedule/calendar writers — classified in USE_CASE_AUDIT but not driven by this gate (Q1→B). */
const SCHEDULE_CALENDAR_WRITE_NAMES = new Set(readScheduleCalendarWriteFunctionNames());

function entryOf(name: string): ReadUseCase | undefined {
  return READ_USE_CASES.find((entry) => entry.name === name);
}

/** Epic 1 use-case writes only — the DRIVEN half stays on the registry (Q1→B). */
const DECLARED_ON_USE_CASE_SURFACE = DECLARED.filter(
  ([name]) => !SCHEDULE_CALENDAR_WRITE_NAMES.has(name),
);

describe('every use case that changes anything is classified for audit', () => {
  it('declares every export that is not a registered read — audited, or unaudited with a reason', () => {
    const exported = readSurfaceFunctionNames();
    const unclassified = exported.filter((name) => !READ_NAMES.has(name) && !Object.hasOwn(USE_CASE_AUDIT, name));
    expect(
      unclassified,
      `these functions are exported from ${READ_SURFACE_MODULE}, are not registered as reads in ` +
        `${REGISTRY_MODULE}, and have no audit declaration in ${USE_CASE_AUDIT_MODULE}: ` +
        `${unclassified.join(', ')}. Declare each { audited: [actions] } — and call audit.record ` +
        'inside its transaction — or { unaudited: "why it is not on NFR-A1\'s list" }.',
    ).toEqual([]);
  });

  it('declares every schedule/calendar write export (retro F10 / Q1→B)', () => {
    const exported = readScheduleCalendarWriteFunctionNames();
    const unclassified = exported.filter((name) => !Object.hasOwn(USE_CASE_AUDIT, name));
    expect(
      unclassified,
      `these functions are exported from ${SCHEDULE_CALENDAR_WRITE_MODULES.join(' / ')} with no ` +
        `audit declaration in ${USE_CASE_AUDIT_MODULE}: ${unclassified.join(', ')}. Declare each ` +
        '{ audited: [actions] } and merge via SCHEDULE_AUDIT / CALENDAR_AUDIT.',
    ).toEqual([]);
  });

  it('lets no use case exempt itself from the audit trail (retro A2)', () => {
    const selfExempted = DECLARED.filter(
      ([name, declaration]) =>
        'unaudited' in declaration && !Object.hasOwn(UNAUDITED_BY_DECISION, name),
    ).map(([name]) => name);

    expect(
      selfExempted,
      'these use cases declare themselves unaudited and are not in UNAUDITED_BY_DECISION in this ' +
        'gate. Either record the action through `audit.record` and declare { audited: [...] }, or ' +
        "add it here with the reason it is not on NFR-A1's list — a use case may not exempt " +
        'itself in the file that implements it.',
    ).toEqual([]);
  });

  it('keeps no unaudited exemption a use case no longer claims (retro A2)', () => {
    const declaredUnaudited = new Set(
      DECLARED.filter(([, d]) => 'unaudited' in d).map(([name]) => name),
    );
    const stale = Object.keys(UNAUDITED_BY_DECISION).filter((name) => !declaredUnaudited.has(name));

    expect(
      stale,
      'these are exempted in UNAUDITED_BY_DECISION but no longer declare `unaudited` — remove ' +
        'them, so the list cannot keep quietly excusing a use case that is now audited or gone',
    ).toEqual([]);
  });

  it('declares nothing that is not an exported write use case or schedule/calendar writer', () => {
    const exported = new Set([
      ...readSurfaceFunctionNames(),
      ...readScheduleCalendarWriteFunctionNames(),
    ]);
    const stale = DECLARED.map(([name]) => name).filter(
      (name) => !exported.has(name) || READ_NAMES.has(name),
    );
    expect(
      stale,
      `${USE_CASE_AUDIT_MODULE} declares ${stale.join(', ')}, which is not an exported write of ` +
        `${READ_SURFACE_MODULE} or ${SCHEDULE_CALENDAR_WRITE_MODULES.join(' / ')}`,
    ).toEqual([]);
  });

  it('gives every declaration its substance: real enum members, or a stated reason', () => {
    const broken = DECLARED.flatMap(([name, declaration]) => {
      if ('audited' in declaration) {
        const bad = declaration.audited.filter((action) => !isAuditAction(action));
        return bad.length > 0 || declaration.audited.length === 0
          ? [`${name}: audited with ${bad.length > 0 ? `non-members ${bad.join(', ')}` : 'no action'}`]
          : [];
      }
      return declaration.unaudited.trim().length === 0 ? [`${name}: unaudited with no reason`] : [];
    });
    expect(broken).toEqual([]);
  });

  it('can drive every declared use-case-surface write — each has a write entry with invokeWrite', () => {
    const undrivable = DECLARED_ON_USE_CASE_SURFACE.map(([name]) => name).filter(
      (name) => typeof entryOf(name)?.invokeWrite !== 'function',
    );
    expect(
      undrivable,
      `every use-case-surface write declared in ${USE_CASE_AUDIT_MODULE} needs an entry of kind ` +
        `'write' with invokeWrite in ${REGISTRY_MODULE}, or this gate cannot drive it: ` +
        `${undrivable.join(', ')}`,
    ).toEqual([]);
  });

  it('drives at least one audited use case', () => {
    expect(DECLARED_ON_USE_CASE_SURFACE.some(([, declaration]) => 'audited' in declaration)).toBe(
      true,
    );
  });
});

/**
 * The stamp each write family must put on its record: the Project's anchor for the project writes
 * (their rows stay byte-identical), the Clock for the organisation and membership writes. Per family, so a project
 * write stamped by the Clock — or an org write by an anchor — fails. A declared write in neither
 * family fails here too, until its family's stamp is stated.
 */
function expectedStamp(name: string): Date | undefined {
  if (Object.hasOwn(PROJECT_WRITE_AUDIT, name)) return AT;
  if (Object.hasOwn(ORG_WRITE_AUDIT, name)) return NOW;
  if (Object.hasOwn(MEMBERSHIP_WRITE_AUDIT, name)) return NOW;
  if (Object.hasOwn(RESOURCE_WRITE_AUDIT, name)) return NOW;
  if (Object.hasOwn(CONNECTOR_WRITE_AUDIT, name)) return AT;
  return undefined;
}

/** Local AES stub for connector writes driven by this gate (no real key material). */
export const GATE_CREDENTIALS_CRYPTO: CredentialsCryptoPort = {
  keyId: 'gate-local',
  encrypt: () => ({
    ciphertext: Buffer.from('cipher'),
    nonce: Buffer.from('nonce------'),
    keyId: 'gate-local',
  }),
  decrypt: () => ({ apiKey: 'gate' }),
};

/** Driven half: Epic 1 use-case surface only (schedule/calendar classified, not driven — Q1→B). */
const AUDITED = DECLARED_ON_USE_CASE_SURFACE.flatMap(([name, declaration]) =>
  'audited' in declaration ? [[name, declaration.audited] as const] : [],
);
const UNAUDITED = DECLARED_ON_USE_CASE_SURFACE.flatMap(([name, declaration]) =>
  'unaudited' in declaration ? [name] : [],
);

describe.each(AUDITED)('audited use case %s', (name, actions) => {
  const invocations = () => invocationsOf(entryOf(name)!).map((invoke, index) => [index, invoke] as const);

  it('commits exactly one record, of a declared action, in the one transaction that made its change — for every input', async () => {
    for (const [index, invoke] of invocations()) {
      const label = `${name} (input ${index})`;
      const run = await drive(invoke);

      expect(run.error, `${label} threw against the fake transaction: ${String(run.error)}`).toBeUndefined();
      expect(run.returned, `${label} did not answer ok`).toMatchObject({ ok: true });
      expect(run.transactions, `${label} opened ${run.transactions} transactions; a use case opens exactly one`).toBe(1);
      expect(
        run.records.length,
        `${label} committed ${run.records.length} audit records; an audited use case commits exactly one`,
      ).toBe(1);
      const [committed] = run.records;
      expect(actions, `${label} recorded ${committed!.entry.action}, which it does not declare`).toContain(
        committed!.entry.action,
      );
      expect(isAuditAction(committed!.entry.action)).toBe(true);
      expect(run.changes.length, `${label} made no change through its repository`).toBeGreaterThan(0);
      expect(
        run.changes.every((change) => change.transaction === committed!.transaction),
        `${label} made its change and its audit record in different transactions`,
      ).toBe(true);
      expect(committed!.entry.actor).toBe(ACTOR);
      const stamp = expectedStamp(name);
      expect(stamp, `${name} belongs to no write family whose stamp this gate knows`).toBeDefined();
      expect(
        committed!.entry.at,
        `${label} stamped its record with the wrong time (${stamp === AT ? 'the anchor' : 'the Clock'} expected)`,
      ).toEqual(stamp);
      // A create answers the id it minted, and that id is what its record names — required of
      // every `create*` write, so one that stops answering `{ id }` fails; any other write that
      // answers a value is held to the same shape.
      const value = (run.returned as { value?: unknown }).value;
      if (name.startsWith('create') || value !== undefined) {
        expect(value, `${label} answered a value that is not the id its record names`).toEqual({
          id: committed!.entry.target,
        });
      }
    }
  });

  it('records every action it declares, across its inputs', async () => {
    const seen = new Set<string>();
    for (const [, invoke] of invocations()) {
      for (const record of (await drive(invoke)).records) seen.add(record.entry.action);
    }
    const unseen = actions.filter((action) => !seen.has(action));
    expect(
      unseen,
      `${name} declares ${unseen.join(', ')} but no input in ${REGISTRY_MODULE} records it — add the ` +
        'branch that does to the entry\'s moreWrites, or the gate cannot see it skip audit.record',
    ).toEqual([]);
  });

  it('commits no record when its change throws', async () => {
    for (const [index, invoke] of invocations()) {
      const run = await drive(invoke, { memberThrows: true });
      expect(run.error, `${name} (input ${index}) swallowed its repository's failure`).toBeDefined();
      expect(
        run.records,
        `${name} (input ${index}) committed an audit record although its change failed — the record is outside the change's transaction`,
      ).toEqual([]);
    }
  });

  it('commits no record when the transaction fails after its work', async () => {
    for (const [index, invoke] of invocations()) {
      const run = await drive(invoke, { failAfterWork: true });
      expect(run.error).toBeDefined();
      expect(
        run.records,
        `${name} (input ${index}) committed an audit record although its transaction rolled back`,
      ).toEqual([]);
    }
  });
});

describe.skipIf(UNAUDITED.length === 0).each(UNAUDITED)('unaudited use case %s', (name) => {
  it('commits no audit record — the declaration is true', async () => {
    for (const invoke of invocationsOf(entryOf(name)!)) {
      const run = await drive(invoke);
      expect(run.records, `${name} is declared unaudited but records`).toEqual([]);
    }
  });
});
