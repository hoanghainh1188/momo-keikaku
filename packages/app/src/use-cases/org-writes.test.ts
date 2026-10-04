import { describe, expect, it } from 'vitest';
import { projectDate } from '@momo/domain';
import type { AuditEntry } from '../audit';
import type { RequestContext } from '../authz/request-context';
import type {
  DepartmentRow,
  OrgRepository,
  ProgramRow,
  ProjectPlacementRow,
} from '../ports/org-write';
import type { ResourceWriteRepository } from '../ports/resource-write';
import type { WriteDeps } from '../ports/write-deps';
import {
  createDepartment,
  createProgram,
  createProject,
  reassignProjectDepartment,
  reassignProjectProgram,
  renameDepartment,
  renameProgram,
  renameProject,
} from '.';
import { NEW_PROJECT_DEFAULTS } from './org-writes';

/**
 * The eight organisation writes against a fake tenant transaction over a small in-memory org —
 * no database, no environment (story 1.3 slice 2).
 *
 * Pinned here: the I/O matrix's rows at the use-case level — a Program only within the Project's
 * owning Department (`invalid_input`, nothing lands), an invisible row answers `not_found` and
 * nothing lands, a rename records `{ before, after }`, a Department reassignment that keeps a
 * now-foreign Program is refused, blank and NUL names are `invalid_input` before any transaction
 * opens; the audit `at` is the Clock's, new ids are the id port's, a new Project takes the
 * documented defaults. The write harness then proves the same against Postgres and real
 * row-level security, and the audit gate holds the one-record contract for all of them.
 */

const HANDLE = { marker: 'handle' };
/** The signed-in Tenant Admin; the audit actor is derived from its user id (story 1.5). */
const CTX: RequestContext = {
  tenantId: 'ten-a',
  userId: 'test-admin',
  roles: ['tenant_admin'],
  projectIds: [],
  locale: 'en',
};
const ACTOR = 'user:test-admin';
const NOW = new Date('2026-09-21T09:30:00Z');

interface World {
  readonly departments: readonly DepartmentRow[];
  readonly programs: readonly ProgramRow[];
  readonly projects: readonly ProjectPlacementRow[];
}

/** Two Departments, a Program in each, and a Project in the first Department's Program. */
const WORLD: World = {
  departments: [
    { id: 'dep-x', name: 'Delivery' },
    { id: 'dep-y', name: 'Design' },
  ],
  programs: [
    { id: 'prg-x', departmentId: 'dep-x', name: 'EC platform' },
    { id: 'prg-y', departmentId: 'dep-y', name: 'Brand' },
  ],
  projects: [{ id: 'prj-1', name: 'EC phase 2', departmentId: 'dep-x', programId: 'prg-x' }],
};

interface Call {
  readonly member: string;
  readonly arg: unknown;
}

/**
 * A tenant transaction that commits the calls its work made when the work resolves and discards
 * them when it throws — the contract `packages/db`'s `inTenantTransaction` keeps with Postgres.
 * Hands both `org` and `resources` so `createProject`'s dual-write is exercised.
 */
function fakeDeps(world: World = WORLD, clockNow: Date = NOW) {
  const transactions: string[] = [];
  const committed: Call[] = [];
  const audits: AuditEntry[] = [];
  let issued = 0;

  const deps: WriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    clock: { now: () => clockNow },
    ids: { next: () => `new-${(issued += 1)}` },
    transaction: async (_handle, tenantId, work) => {
      transactions.push(tenantId);
      const calls: Call[] = [];
      const pendingAudits: AuditEntry[] = [];
      const write =
        <A>(member: string) =>
        async (arg: A): Promise<void> => {
          calls.push({ member, arg });
        };
      const org: OrgRepository = {
        findDepartment: async (id) => world.departments.find((d) => d.id === id) ?? null,
        findProgram: async (id) => world.programs.find((p) => p.id === id) ?? null,
        findProject: async (id) => world.projects.find((p) => p.id === id) ?? null,
        insertDepartment: write('org.insertDepartment'),
        renameDepartment: write('org.renameDepartment'),
        insertProgram: write('org.insertProgram'),
        renameProgram: write('org.renameProgram'),
        insertProject: write('org.insertProject'),
        renameProject: write('org.renameProject'),
        setProjectProgram: write('org.setProjectProgram'),
        setProjectDepartment: write('org.setProjectDepartment'),
      };
      const resources: ResourceWriteRepository = {
        findDepartment: async (id) => (world.departments.some((d) => d.id === id) ? { id } : null),
        findResource: async () => null,
        findProject: async (id) => (world.projects.some((p) => p.id === id) ? { id } : null),
        insertResource: write('resources.insertResource'),
        appendResourceRate: write('resources.appendResourceRate'),
        appendProjectDefaultRate: write('resources.appendProjectDefaultRate'),
      };
      const result = await work({
        projectWrite: {} as never,
        org,
        resources,
        membership: {} as never,
        connectorWrite: {} as never,
        bound: { tx: {}, tenantId: CTX.tenantId },
        audit: { append: async (entry) => void pendingAudits.push(entry) },
      });
      committed.push(...calls);
      audits.push(...pendingAudits);
      return result;
    },
  };
  return { deps, transactions, committed, audits };
}

const OK = { ok: true, value: undefined };
/** What a create answers: the id the (fake) id port minted. */
const CREATED = (id: string) => ({ ok: true, value: { id } });

describe('the role gate', () => {
  it('answers not_found to a PM, opening no transaction', async () => {
    const { deps, transactions } = fakeDeps();
    const pm = { ...CTX, roles: ['pm'] as const };
    expect(await createDepartment(deps, pm, { name: 'Research' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(transactions).toEqual([]);
  });

  it('answers not_found, not invalid_input, to a non-admin sending malformed input', async () => {
    const { deps, transactions } = fakeDeps();
    const pm = { ...CTX, roles: ['pm'] as const };
    expect(await renameDepartment(deps, pm, { departmentId: '', name: '' })).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(transactions).toEqual([]);
  });
});

describe('creating org units', () => {
  it('creates a Department with an id from the id port, audited at the Clock', async () => {
    const { deps, committed, audits, transactions } = fakeDeps();
    expect(await createDepartment(deps, CTX, { name: '  Research  ' })).toEqual(CREATED('new-1'));
    expect(transactions).toEqual(['ten-a']);
    expect(committed).toEqual([{ member: 'org.insertDepartment', arg: { id: 'new-1', name: 'Research' } }]);
    expect(audits).toEqual([
      { actor: ACTOR, at: NOW, action: 'department.create', target: 'new-1', payload: { name: 'Research' } },
    ]);
  });

  it('creates a Program in an own Department — the row and one audit row, at the Clock', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(await createProgram(deps, CTX, { departmentId: 'dep-y', name: 'Retail' })).toEqual(CREATED('new-1'));
    expect(committed).toEqual([
      { member: 'org.insertProgram', arg: { id: 'new-1', departmentId: 'dep-y', name: 'Retail' } },
    ]);
    expect(audits).toEqual([
      {
        actor: ACTOR,
        at: NOW,
        action: 'program.create',
        target: 'new-1',
        payload: { departmentId: 'dep-y', name: 'Retail' },
      },
    ]);
  });

  it('creates a Project with the documented defaults and the Clock as its anchor', async () => {
    const { deps, committed, audits } = fakeDeps();
    const result = await createProject(deps, CTX, {
      name: 'EC phase 3',
      departmentId: 'dep-x',
      programId: 'prg-x',
      clientName: 'Osaka Retail',
      contractType: '請負',
    });
    expect(result).toEqual(CREATED('new-1'));
    expect(committed).toEqual([
      {
        member: 'org.insertProject',
        arg: {
          id: 'new-1',
          name: 'EC phase 3',
          departmentId: 'dep-x',
          programId: 'prg-x',
          clientName: 'Osaka Retail',
          contractType: '請負',
          ...NEW_PROJECT_DEFAULTS,
          demoAnchor: NOW,
        },
      },
      {
        member: 'resources.appendProjectDefaultRate',
        arg: {
          projectId: 'new-1',
          effectiveFrom: projectDate(NOW.toISOString(), NEW_PROJECT_DEFAULTS.tzOffsetMinutes),
          yenPerHour: 0,
        },
      },
    ]);
    // Everything the row was created with, the defaults and the anchor included.
    expect(audits.map((a) => a.payload)).toEqual([
      {
        name: 'EC phase 3',
        departmentId: 'dep-x',
        programId: 'prg-x',
        clientName: 'Osaka Retail',
        contractType: '請負',
        tzOffsetMinutes: 540,
        teireiWeekday: 1,
        defaultRateJpy: 0,
        eacMethod: 'typical',
        calendarJp: true,
        calendarVn: false,
        demoAnchor: '2026-09-21T09:30:00.000Z',
      },
    ]);
  });

  it('creates a Project in no Program when the Program is left out', async () => {
    const { deps, committed } = fakeDeps();
    expect(
      await createProject(deps, CTX, {
        name: 'Internal',
        departmentId: 'dep-y',
        clientName: 'Momo',
        contractType: '準委任',
      }),
    ).toEqual(CREATED('new-1'));
    expect(committed[0]?.arg).toMatchObject({ departmentId: 'dep-y', programId: null });
    expect(committed[1]?.member).toBe('resources.appendProjectDefaultRate');
  });

  it("dates the first default Rate on the Project calendar day, not the UTC date of the Clock", async () => {
    // 16:00 UTC on 20 Sep is already 01:00 JST on 21 Sep (tzOffsetMinutes 540).
    const eveningUtc = new Date('2026-09-20T16:00:00.000Z');
    expect(eveningUtc.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(projectDate(eveningUtc.toISOString(), NEW_PROJECT_DEFAULTS.tzOffsetMinutes)).toBe(
      '2026-09-21',
    );
    const { deps, committed } = fakeDeps(WORLD, eveningUtc);
    expect(
      await createProject(deps, CTX, {
        name: 'Evening create',
        departmentId: 'dep-x',
        clientName: 'Osaka Retail',
        contractType: '請負',
      }),
    ).toEqual(CREATED('new-1'));
    expect(committed[1]).toEqual({
      member: 'resources.appendProjectDefaultRate',
      arg: {
        projectId: 'new-1',
        effectiveFrom: '2026-09-21',
        yenPerHour: 0,
      },
    });
  });

  it('pins the defaults themselves', () => {
    expect(NEW_PROJECT_DEFAULTS).toEqual({
      tzOffsetMinutes: 540,
      teireiWeekday: 1,
      defaultRateJpy: 0,
      eacMethod: 'typical',
      calendarJp: true,
      calendarVn: false,
    });
  });
});

describe('a Program only within the Project\'s owning Department', () => {
  it('refuses a Project created with another Department\'s Program — invalid_input, nothing lands', async () => {
    const { deps, committed, audits } = fakeDeps();
    const result = await createProject(deps, CTX, {
      name: 'Mixed',
      departmentId: 'dep-x',
      programId: 'prg-y',
      clientName: 'C',
      contractType: '請負',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(committed).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('refuses moving a Project into another Department\'s Program — invalid_input, nothing lands', async () => {
    const { deps, committed, audits } = fakeDeps();
    const result = await reassignProjectProgram(deps, CTX, { projectId: 'prj-1', programId: 'prg-y' });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_input',
        messageKey: 'errors.invalid_input',
        details: { programId: ['program_not_in_department'] },
      },
    });
    expect(committed).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('moves a Project between its own Department\'s Programs, recording the previous one', async () => {
    const world: World = {
      ...WORLD,
      programs: [...WORLD.programs, { id: 'prg-x2', departmentId: 'dep-x', name: 'Mobile' }],
    };
    const { deps, committed, audits } = fakeDeps(world);
    expect(await reassignProjectProgram(deps, CTX, { projectId: 'prj-1', programId: 'prg-x2' })).toEqual(OK);
    expect(committed).toEqual([{ member: 'org.setProjectProgram', arg: { id: 'prj-1', programId: 'prg-x2' } }]);
    expect(audits.map((a) => [a.action, a.target, a.payload])).toEqual([
      ['project.reassign_program', 'prj-1', { before: 'prg-x', after: 'prg-x2' }],
    ]);
  });

  it('clears a Project\'s Program', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(await reassignProjectProgram(deps, CTX, { projectId: 'prj-1', programId: null })).toEqual(OK);
    expect(committed).toEqual([{ member: 'org.setProjectProgram', arg: { id: 'prj-1', programId: null } }]);
    expect(audits[0]?.payload).toEqual({ before: 'prg-x', after: null });
  });

  it('refuses a Department reassignment that keeps the now-foreign Program', async () => {
    const { deps, committed, audits } = fakeDeps();
    const result = await reassignProjectDepartment(deps, CTX, {
      projectId: 'prj-1',
      departmentId: 'dep-y',
      programId: 'prg-x',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(committed).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('reassigns the Department with the Program replaced by one of the new Department\'s', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(
      await reassignProjectDepartment(deps, CTX, { projectId: 'prj-1', departmentId: 'dep-y', programId: 'prg-y' }),
    ).toEqual(OK);
    expect(committed).toEqual([
      { member: 'org.setProjectDepartment', arg: { id: 'prj-1', departmentId: 'dep-y', programId: 'prg-y' } },
    ]);
    expect(audits[0]?.payload).toEqual({
      before: { departmentId: 'dep-x', programId: 'prg-x' },
      after: { departmentId: 'dep-y', programId: 'prg-y' },
    });
  });

  it('reassigns the Department with the Program cleared', async () => {
    const { deps, committed } = fakeDeps();
    expect(
      await reassignProjectDepartment(deps, CTX, { projectId: 'prj-1', departmentId: 'dep-y', programId: null }),
    ).toEqual(OK);
    expect(committed[0]?.arg).toEqual({ id: 'prj-1', departmentId: 'dep-y', programId: null });
  });

  it('refuses a Department reassignment that leaves the Program unstated', async () => {
    const { deps, transactions } = fakeDeps();
    const result = await reassignProjectDepartment(deps, CTX, {
      projectId: 'prj-1',
      departmentId: 'dep-y',
    } as never);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(transactions).toEqual([]);
  });
});

describe('renames record the previous value', () => {
  it.each([
    ['renameDepartment', () => renameDepartment, { departmentId: 'dep-x', name: 'Delivery JP' }, 'department.rename', 'dep-x', 'Delivery'],
    ['renameProgram', () => renameProgram, { programId: 'prg-x', name: 'EC' }, 'program.rename', 'prg-x', 'EC platform'],
    ['renameProject', () => renameProject, { projectId: 'prj-1', name: 'EC phase 2b' }, 'project.rename', 'prj-1', 'EC phase 2'],
  ] as const)('%s', async (_name, useCase, input, action, target, before) => {
    const { deps, committed, audits } = fakeDeps();
    const run = useCase() as (d: typeof deps, c: RequestContext, i: typeof input) => Promise<unknown>;
    expect(await run(deps, CTX, input)).toEqual(OK);
    expect(committed).toEqual([{ member: `org.${_name}`, arg: { id: target, name: input.name } }]);
    expect(audits).toEqual([
      { actor: ACTOR, at: NOW, action, target, payload: { before, after: input.name } },
    ]);
  });
});

describe('what the Tenant cannot see answers not_found, and nothing lands', () => {
  const unseen = 'dep-of-another-tenant';
  it.each([
    ['renameDepartment', () => renameDepartment(fakeDeps().deps, CTX, { departmentId: unseen, name: 'n' })],
    ['createProgram', () => createProgram(fakeDeps().deps, CTX, { departmentId: unseen, name: 'n' })],
    ['renameProgram', () => renameProgram(fakeDeps().deps, CTX, { programId: 'prg-unseen', name: 'n' })],
    [
      'createProject (Department)',
      () => createProject(fakeDeps().deps, CTX, { name: 'n', departmentId: unseen, clientName: 'c', contractType: '請負' }),
    ],
    [
      'createProject (Program)',
      () =>
        createProject(fakeDeps().deps, CTX, {
          name: 'n',
          departmentId: 'dep-x',
          programId: 'prg-unseen',
          clientName: 'c',
          contractType: '請負',
        }),
    ],
    ['renameProject', () => renameProject(fakeDeps().deps, CTX, { projectId: 'prj-unseen', name: 'n' })],
    ['reassignProjectProgram (Project)', () => reassignProjectProgram(fakeDeps().deps, CTX, { projectId: 'prj-unseen', programId: null })],
    ['reassignProjectProgram (Program)', () => reassignProjectProgram(fakeDeps().deps, CTX, { projectId: 'prj-1', programId: 'prg-unseen' })],
    [
      'reassignProjectDepartment (Project)',
      () =>
        reassignProjectDepartment(fakeDeps().deps, CTX, { projectId: 'prj-unseen', departmentId: 'dep-y', programId: null }),
    ],
    [
      'reassignProjectDepartment (Program)',
      () =>
        reassignProjectDepartment(fakeDeps().deps, CTX, { projectId: 'prj-1', departmentId: 'dep-y', programId: 'prg-unseen' }),
    ],
    [
      'reassignProjectDepartment (Department)',
      () => reassignProjectDepartment(fakeDeps().deps, CTX, { projectId: 'prj-1', departmentId: unseen, programId: null }),
    ],
  ] as const)('%s', async (_name, run) => {
    expect(await run()).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
  });

  it('commits nothing when the row is invisible', async () => {
    const { deps, committed, audits } = fakeDeps();
    await renameDepartment(deps, CTX, { departmentId: unseen, name: 'n' });
    expect(committed).toEqual([]);
    expect(audits).toEqual([]);
  });
});

describe('a name is stored and audited trimmed', () => {
  it('trims a created name in the row and in the record', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(await createDepartment(deps, CTX, { name: '  Delivery  ' })).toEqual(CREATED('new-1'));
    expect(committed).toEqual([{ member: 'org.insertDepartment', arg: { id: 'new-1', name: 'Delivery' } }]);
    expect(audits.map((a) => a.payload)).toEqual([{ name: 'Delivery' }]);
  });

  it('trims a new name in the rename and in the record\'s `after`', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(await renameDepartment(deps, CTX, { departmentId: 'dep-y', name: '  Delivery  ' })).toEqual(OK);
    expect(committed).toEqual([{ member: 'org.renameDepartment', arg: { id: 'dep-y', name: 'Delivery' } }]);
    expect(audits.map((a) => a.payload)).toEqual([{ before: 'Design', after: 'Delivery' }]);
  });
});

describe('blank or NUL names are invalid_input, before any transaction opens', () => {
  it.each(['', '  ', 'a\0'])('%j', async (name) => {
    const { deps, transactions } = fakeDeps();
    const results = [
      await createDepartment(deps, CTX, { name }),
      await renameDepartment(deps, CTX, { departmentId: 'dep-x', name }),
      await createProgram(deps, CTX, { departmentId: 'dep-x', name }),
      await renameProgram(deps, CTX, { programId: 'prg-x', name }),
      await createProject(deps, CTX, { name, departmentId: 'dep-x', clientName: 'c', contractType: '請負' }),
      await createProject(deps, CTX, { name: 'n', departmentId: 'dep-x', clientName: name, contractType: '請負' }),
      await renameProject(deps, CTX, { projectId: 'prj-1', name }),
    ];
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    }
    expect(transactions).toEqual([]);
  });

  it('refuses an unknown contract type and a NUL id the same way', async () => {
    const { deps, transactions } = fakeDeps();
    expect(
      await createProject(deps, CTX, { name: 'n', departmentId: 'dep-x', clientName: 'c', contractType: 'fixed' as never }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await renameProject(deps, CTX, { projectId: 'prj\0', name: 'n' })).toMatchObject({
      ok: false,
      error: { code: 'invalid_input' },
    });
    expect(transactions).toEqual([]);
  });
});

describe('failures that are not a refusal propagate', () => {
  it('an adapter failure is thrown, never reported as not_found or ok', async () => {
    const { deps } = fakeDeps();
    const failing: WriteDeps<typeof HANDLE> = {
      ...deps,
      transaction: (handle, tenantId, work) =>
        deps.transaction(handle, tenantId, (scope) =>
          work({
            ...scope,
            org: {
              ...scope.org,
              insertDepartment: async () => {
                throw new Error('connection reset');
              },
            },
          }),
        ),
    };
    await expect(createDepartment(failing, CTX, { name: 'x' })).rejects.toThrow('connection reset');
  });
});
