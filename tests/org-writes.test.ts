import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDepartment,
  createProgram,
  createProject,
  reassignProjectDepartment,
  reassignProjectProgram,
  renameDepartment,
} from '../packages/app/src/use-cases';
import { closeAllPools } from '../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import {
  allRows,
  idPort,
  landedRows,
  owner,
  connectWriteHarness,
  restrictedWriteDeps,
  rowCounts,
} from './write-harness';
import { requestContextFor } from './request-context';

/**
 * THE ORGANISATION RULES AGAINST REAL ROWS (story 1.3 slice 2).
 *
 * `tests/cross-tenant-writes.test.ts` drives every organisation write once, foreign and own. This
 * file drives the I/O matrix rows that need a SECOND Department and a SECOND Program in one
 * Tenant — which the fixture does not carry — built through the use cases themselves, on a probe
 * Tenant of its own, as the restricted role:
 *
 *   * a Program of another Department is refused on a Project — `invalid_input`, nothing lands;
 *   * a Department reassignment keeping the now-foreign Program is refused — nothing lands;
 *   * a move between Programs changes the Project's `program_id` and NOTHING ELSE: every row of
 *     every other tenant-owned table is compared before and after (the Baselines, the ledger, the
 *     Mappings, the snapshots — the probe carries the whole demo dataset), and the one new audit
 *     row is the only addition;
 *   * a Department reassignment replacing the Program with one of the new Department's changes
 *     that one Project row and adds its audit row, and nothing else;
 *   * an OWN Project given ANOTHER Tenant's Department or Program id answers `not_found` — never
 *     `invalid_input`, which would disclose that the id exists — and lands nothing.
 *
 * Its own probe Tenants and seq bands, for the reason every DB suite has them: vitest runs the
 * files in parallel. Each test sets up the placement it needs, so none depends on another's order.
 */

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE_O = buildProbeTenant('xtprobe-org', 740_000_000);
/** The other Tenant, whose Department and Program ids O's writes name. */
const PROBE_F = buildProbeTenant('xtprobe-fgn', 750_000_000);
assertProbeTenantsDisjoint([PROBE_O, PROBE_F]);

const IDS = idPort('xtorg-id');
const deps = () => restrictedWriteDeps(IDS);
const ctx = requestContextFor(PROBE_O.tenantId);
const projectId = PROBE_O.projectId;
const homeDepartment = PROBE_O.state.fixture.department.id;
const homeProgram = PROBE_O.state.fixture.program.id;

/** The id a create answered — failing loudly if it answered anything else. */
function createdId(result: unknown): string {
  expect(result).toMatchObject({ ok: true, value: { id: expect.any(String) } });
  return (result as { value: { id: string } }).value.id;
}

async function projectRow(id: string = projectId) {
  const row = (await landedRows(PROBE_O.tenantId)).projects.find((p) => p.id === id);
  if (!row) throw new Error(`${id} is not visible`);
  return row;
}

/** The newest audit row of Tenant O. */
async function lastAudit() {
  const audits = [...(await landedRows(PROBE_O.tenantId)).audits].sort((a, b) => a.seq - b.seq);
  return audits[audits.length - 1];
}

/**
 * Asserts that between two `allRows` reads exactly one `project` row changed and exactly one
 * `audit_log` row was added, and every other table is row-for-row the same.
 */
function expectOnlyProjectChanged(
  before: Record<string, readonly string[]>,
  after: Record<string, readonly string[]>,
  what: string,
) {
  for (const table of Object.keys(before)) {
    if (table === 'project' || table === 'audit_log') continue;
    expect(after[table], `${what} changed ${table}`).toEqual(before[table]);
  }
  const gone = before.project!.filter((row) => !after.project!.includes(row));
  const added = after.project!.filter((row) => !before.project!.includes(row));
  expect([gone.length, added.length], `${what} changed other project rows`).toEqual([1, 1]);
  expect(
    before.audit_log!.every((row) => after.audit_log!.includes(row)),
    `${what} changed an audit row`,
  ).toBe(true);
  expect(after.audit_log!.length - before.audit_log!.length, `${what} added other audit rows`).toBe(1);
}

describe.skipIf(!reachable)('the organisation rules, against a probe Tenant as the restricted role', () => {
  /** A second Department, and a Program in it — made through the use cases. */
  let otherDepartment: string;
  let otherProgram: string;

  beforeAll(async () => {
    await createProbeTenant(owner(), PROBE_O);
    await createProbeTenant(owner(), PROBE_F);
    otherDepartment = createdId(await createDepartment(deps(), ctx, { name: 'Second Department' }));
    otherProgram = createdId(
      await createProgram(deps(), ctx, { departmentId: otherDepartment, name: 'Second Program' }),
    );
  }, 120_000);

  afterAll(async () => {
    const left: string[] = [];
    for (const probe of [PROBE_O, PROBE_F]) {
      await removeProbeTenant(owner(), probe);
      left.push(
        ...Object.entries(await rowCounts(probe.tenantId))
          .filter(([, n]) => n > 0)
          .map(([table]) => `${probe.tenantId}.${table}`),
      );
    }
    expect(left, 'the org suite left probe rows behind').toEqual([]);
  }, 120_000);

  it('stores and audits a name trimmed, on a create and on a rename', async () => {
    const id = createdId(await createDepartment(deps(), ctx, { name: '  Delivery  ' }));
    const stored = async () =>
      (await landedRows(PROBE_O.tenantId)).departments.find((d) => d.id === id)?.name;
    expect(await stored()).toBe('Delivery');
    expect(await lastAudit()).toMatchObject({ action: 'department.create', payload: { name: 'Delivery' } });

    await renameDepartment(deps(), ctx, { departmentId: id, name: 'Other' });
    expect(await renameDepartment(deps(), ctx, { departmentId: id, name: '  Delivery  ' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await stored()).toBe('Delivery');
    expect(await lastAudit()).toMatchObject({
      action: 'department.rename',
      payload: { before: 'Other', after: 'Delivery' },
    });
  });

  it('refuses a Program of another Department on a Project — invalid_input, nothing lands', async () => {
    const before = await allRows(PROBE_O.tenantId);

    const moved = await reassignProjectProgram(deps(), ctx, { projectId, programId: otherProgram });
    const created = await createProject(deps(), ctx, {
      name: 'Mixed',
      departmentId: homeDepartment,
      programId: otherProgram,
      clientName: 'C',
      contractType: '請負',
    });

    expect(moved).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(created).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await allRows(PROBE_O.tenantId)).toEqual(before);
  });

  it('refuses a Department reassignment that keeps the now-foreign Program — nothing lands', async () => {
    const before = await allRows(PROBE_O.tenantId);
    const result = await reassignProjectDepartment(deps(), ctx, {
      projectId,
      departmentId: otherDepartment,
      programId: homeProgram,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await allRows(PROBE_O.tenantId)).toEqual(before);
  });

  it('moves a Project between Programs changing only its program_id — every other table\'s rows unchanged', async () => {
    const sibling = createdId(
      await createProgram(deps(), ctx, { departmentId: homeDepartment, name: 'Sibling Program' }),
    );
    // The fixture's Project: it carries the Baselines, the ledger, the Mappings and the snapshots.
    // Placed in its home Department first, whatever an earlier test did.
    expect(
      await reassignProjectDepartment(deps(), ctx, { projectId, departmentId: homeDepartment, programId: homeProgram }),
    ).toEqual({ ok: true, value: undefined });
    const rowsBefore = await allRows(PROBE_O.tenantId);
    const projectBefore = await projectRow();

    expect(await reassignProjectProgram(deps(), ctx, { projectId, programId: sibling })).toEqual({
      ok: true,
      value: undefined,
    });

    expectOnlyProjectChanged(rowsBefore, await allRows(PROBE_O.tenantId), 'moving a Project between Programs');
    // The Project row: the same in every column but program_id.
    expect(await projectRow()).toEqual({ ...projectBefore, programId: sibling });
    expect(await lastAudit()).toMatchObject({
      action: 'project.reassign_program',
      target: projectId,
      payload: { before: projectBefore.programId, after: sibling },
    });
  });

  it('reassigns the Department with the Program replaced by one of the new Department\'s — only that Project row changes', async () => {
    // Its own placement: a new Department with a Program, and a new Project in the home ones.
    const toDepartment = createdId(await createDepartment(deps(), ctx, { name: 'Move-to Department' }));
    const toProgram = createdId(
      await createProgram(deps(), ctx, { departmentId: toDepartment, name: 'Move-to Program' }),
    );
    const moving = createdId(
      await createProject(deps(), ctx, {
        name: 'Moving Project',
        departmentId: homeDepartment,
        programId: homeProgram,
        clientName: 'Client',
        contractType: '準委任',
      }),
    );
    const rowsBefore = await allRows(PROBE_O.tenantId);
    const projectBefore = await projectRow(moving);

    const result = await reassignProjectDepartment(deps(), ctx, {
      projectId: moving,
      departmentId: toDepartment,
      programId: toProgram,
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expectOnlyProjectChanged(rowsBefore, await allRows(PROBE_O.tenantId), 'moving a Project between Departments');
    const projectAfter = await projectRow(moving);
    expect(projectAfter).toEqual({ ...projectBefore, departmentId: toDepartment, programId: toProgram });
    expect(await lastAudit()).toMatchObject({
      action: 'project.reassign_department',
      target: moving,
      payload: {
        before: { departmentId: projectBefore.departmentId, programId: projectBefore.programId },
        after: { departmentId: projectAfter.departmentId, programId: projectAfter.programId },
      },
    });
  });

  describe('an own Project given another Tenant\'s Department or Program id', () => {
    const foreignDepartment = PROBE_F.state.fixture.department.id;
    const foreignProgram = PROBE_F.state.fixture.program.id;

    it.each([
      ['reassignProjectProgram (foreign Program)', () =>
        reassignProjectProgram(deps(), ctx, { projectId, programId: foreignProgram })],
      ['reassignProjectDepartment (foreign Department)', () =>
        reassignProjectDepartment(deps(), ctx, { projectId, departmentId: foreignDepartment, programId: null })],
      ['reassignProjectDepartment (foreign Program)', () =>
        reassignProjectDepartment(deps(), ctx, { projectId, departmentId: homeDepartment, programId: foreignProgram })],
      ['createProject (foreign Department)', () =>
        createProject(deps(), ctx, { name: 'X', departmentId: foreignDepartment, clientName: 'C', contractType: '請負' })],
      ['createProject (foreign Program)', () =>
        createProject(deps(), ctx, {
          name: 'X',
          departmentId: homeDepartment,
          programId: foreignProgram,
          clientName: 'C',
          contractType: '請負',
        })],
    ] as const)('%s answers not_found — not invalid_input — and lands nothing for either Tenant', async (_name, run) => {
      const before = { o: await allRows(PROBE_O.tenantId), f: await allRows(PROBE_F.tenantId) };
      expect(await run()).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
      expect({ o: await allRows(PROBE_O.tenantId), f: await allRows(PROBE_F.tenantId) }).toEqual(before);
    });
  });
});

afterAll(async () => {
  await closeAllPools();
});
