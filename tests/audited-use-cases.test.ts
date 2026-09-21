import { describe, expect, it } from 'vitest';
import { isAuditAction, type AuditDeclaration, type AuditEntry } from '../packages/app/src/audit';
import type {
  ProjectWriteDeps,
  ProjectWriteRepository,
  ProjectWriteScope,
} from '../packages/app/src/ports/project-write';
import { USE_CASE_AUDIT } from '../packages/app/src/use-cases/audit-declarations';
import {
  READ_SURFACE_MODULE,
  READ_USE_CASES,
  REGISTRY_MODULE,
  readSurfaceFunctionNames,
  type ReadUseCase,
  type WriteTarget,
} from './read-use-cases';

/**
 * THE AUDIT GATE (AD-14, AR-26 — story 1.3 slice 1). Pure: no database, no environment.
 *
 * "An audited use case that commits without its record is impossible to ship unnoticed." Two
 * halves, both enumerated MECHANICALLY off the use-case surface (like the cross-tenant harness),
 * so a use case is covered the day it is exported:
 *
 *   1. CLASSIFIED. Every export of `packages/app/src/use-cases/index.ts` is either a registered
 *      read or declared in `USE_CASE_AUDIT` (`packages/app/src/use-cases/audit-declarations.ts`)
 *      as audited — with the actions it records — or unaudited with a reason. A new write that is
 *      neither fails here, named.
 *   2. DRIVEN. Every declared use case is run, through its registry entry's `invokeWrite`,
 *      against a FAKE tenant transaction that commits what its work did when the work resolves
 *      and discards it when the work throws — the contract `packages/db`'s `inTenantTransaction`
 *      keeps with Postgres. An audited one must open exactly one transaction and commit exactly
 *      one record, of a declared action, on that transaction's own scope; when any repository
 *      member throws, or the transaction fails after the work, it must commit none. An unaudited
 *      one must commit none, ever.
 *
 * What this catches, each watched to fail: a write that skips `audit.record`; `audit.record`
 * made on a second transaction (it would commit although the change rolled back, or open two);
 * an action outside the enum forced past the type; a new write exported unclassified. What the
 * fake cannot prove — that Postgres really rolls the record back with the change — is the write
 * harness's (`tests/cross-tenant-writes.test.ts`), against real row-level security.
 */

const USE_CASE_AUDIT_MODULE = 'packages/app/src/use-cases/audit-declarations.ts';

const HANDLE = { marker: 'fake-handle' };
const ACTOR = 'user:audit-gate';
const AT = new Date('2026-09-01T00:00:00Z');
const TARGET: WriteTarget = {
  tenantId: 'ten-gate',
  projectId: 'prj-gate',
  ticketIds: ['tkt-gate-1', 'tkt-gate-2'],
  wpId: 'wp-gate',
};

type Member = Exclude<keyof ProjectWriteRepository, 'projectAnchor'>;

interface Committed {
  /** The index of the transaction the record was appended in. */
  readonly transaction: number;
  readonly entry: AuditEntry;
}

interface Run {
  readonly transactions: number;
  /** Repository calls that committed, with their transaction's index. */
  readonly changes: readonly { readonly transaction: number; readonly member: Member }[];
  readonly records: readonly Committed[];
  readonly error?: unknown;
  readonly returned?: unknown;
}

interface Sabotage {
  /** A repository member throws after recording its call. */
  readonly memberThrows?: boolean;
  /** The transaction fails after its work resolved, before commit. */
  readonly failAfterWork?: boolean;
}

/** Drives one entry against a fresh fake transaction. */
async function drive(entry: ReadUseCase, sabotage: Sabotage = {}): Promise<Run> {
  let transactions = 0;
  const changes: { transaction: number; member: Member }[] = [];
  const records: Committed[] = [];

  const deps: ProjectWriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    actor: ACTOR,
    transaction: async (_handle, _tenantId, work) => {
      const index = transactions;
      transactions += 1;
      const pendingChanges: { transaction: number; member: Member }[] = [];
      const pendingRecords: Committed[] = [];
      const member =
        <Landed>(name: Member, landed: Landed) =>
        async (): Promise<Landed> => {
          pendingChanges.push({ transaction: index, member: name });
          if (sabotage.memberThrows) throw new Error(`gate: ${name} failed`);
          return landed;
        };
      const scope: ProjectWriteScope = {
        projectWrite: {
          projectAnchor: async () => AT,
          recordMapDisposition: member('recordMapDisposition', undefined),
          recordPlanDisposition: member('recordPlanDisposition', { wpId: 'wp-new-gate' }),
          recordExplainDisposition: member('recordExplainDisposition', undefined),
          recordChangeRequestCandidates: member('recordChangeRequestCandidates', undefined),
          recordManualMapping: member('recordManualMapping', undefined),
        },
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
    const returned = await entry.invokeWrite!(deps, TARGET);
    return { transactions, changes, records, returned };
  } catch (error) {
    return { transactions, changes, records, error };
  }
}

const READ_NAMES = new Set(
  READ_USE_CASES.filter((entry) => entry.kind === 'read').map((entry) => entry.name),
);

const DECLARED: readonly (readonly [string, AuditDeclaration])[] = Object.entries(USE_CASE_AUDIT);

function entryOf(name: string): ReadUseCase | undefined {
  return READ_USE_CASES.find((entry) => entry.name === name);
}

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

  it('declares nothing that is not an exported, non-read use case', () => {
    const exported = new Set(readSurfaceFunctionNames());
    const stale = DECLARED.map(([name]) => name).filter(
      (name) => !exported.has(name) || READ_NAMES.has(name),
    );
    expect(
      stale,
      `${USE_CASE_AUDIT_MODULE} declares ${stale.join(', ')}, which is not an exported write use ` +
        `case of ${READ_SURFACE_MODULE}`,
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

  it('can drive every declared use case — each has a write entry with invokeWrite', () => {
    const undrivable = DECLARED.map(([name]) => name).filter(
      (name) => typeof entryOf(name)?.invokeWrite !== 'function',
    );
    expect(
      undrivable,
      `every use case declared in ${USE_CASE_AUDIT_MODULE} needs an entry of kind 'write' with ` +
        `invokeWrite in ${REGISTRY_MODULE}, or this gate cannot drive it: ${undrivable.join(', ')}`,
    ).toEqual([]);
  });

  it('drives at least one audited use case', () => {
    expect(DECLARED.some(([, declaration]) => 'audited' in declaration)).toBe(true);
  });
});

const AUDITED = DECLARED.flatMap(([name, declaration]) =>
  'audited' in declaration ? [[name, declaration.audited] as const] : [],
);
const UNAUDITED = DECLARED.flatMap(([name, declaration]) =>
  'unaudited' in declaration ? [name] : [],
);

describe.each(AUDITED)('audited use case %s', (name, actions) => {
  const entry = () => entryOf(name)!;

  it('commits exactly one record, of a declared action, in the one transaction that made its change', async () => {
    const run = await drive(entry());

    expect(run.error, `${name} threw against the fake transaction: ${String(run.error)}`).toBeUndefined();
    expect(run.returned, `${name} did not answer ok`).toEqual({ ok: true, value: undefined });
    expect(run.transactions, `${name} opened ${run.transactions} transactions; a use case opens exactly one`).toBe(1);
    expect(
      run.records.length,
      `${name} committed ${run.records.length} audit records; an audited use case commits exactly one`,
    ).toBe(1);
    const [committed] = run.records;
    expect(actions, `${name} recorded ${committed!.entry.action}, which it does not declare`).toContain(
      committed!.entry.action,
    );
    expect(isAuditAction(committed!.entry.action)).toBe(true);
    expect(run.changes.length, `${name} made no change through its repository`).toBeGreaterThan(0);
    expect(
      run.changes.every((change) => change.transaction === committed!.transaction),
      `${name} made its change and its audit record in different transactions`,
    ).toBe(true);
    expect(committed!.entry).toMatchObject({ actor: ACTOR, at: AT });
  });

  it('commits no record when its change throws', async () => {
    const run = await drive(entry(), { memberThrows: true });
    expect(run.error, `${name} swallowed its repository's failure`).toBeDefined();
    expect(
      run.records,
      `${name} committed an audit record although its change failed — the record is outside the change's transaction`,
    ).toEqual([]);
  });

  it('commits no record when the transaction fails after its work', async () => {
    const run = await drive(entry(), { failAfterWork: true });
    expect(run.error).toBeDefined();
    expect(
      run.records,
      `${name} committed an audit record although its transaction rolled back`,
    ).toEqual([]);
  });
});

describe.skipIf(UNAUDITED.length === 0).each(UNAUDITED)('unaudited use case %s', (name) => {
  it('commits no audit record — the declaration is true', async () => {
    const run = await drive(entryOf(name)!);
    expect(run.records, `${name} is declared unaudited but records`).toEqual([]);
  });
});
