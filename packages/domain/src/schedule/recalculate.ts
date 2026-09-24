/**
 * The forward pass: a slip moves the tasks that depend on it (story 2.5).
 *
 * `recalculate(inputs, prevInputs)` is `domain/schedule`'s one pure scheduling function (AD-25:
 * nothing else is named `recalculate`; `app/schedule.recalculateProject` wraps it in 2.9). It
 * reads only its arguments — no clock, no I/O, nothing from `domain/attribution` (AR-7: nothing
 * derived from Tracker evidence is a scheduling input) — and returns either `scheduled` with the
 * whole output or `halted` with a reason, never a partial output.
 *
 *   1. The four graph rules (FR-6a, AR-46) are checked first through `validate`. Any offence
 *      halts with `graph_invalid` and the four lists: the pass never guesses around a cycle.
 *   2. The forward pass (FR-5, FR-6b, AR-49) runs over the leaves in topological order, ties
 *      broken by canonical (`compareWp`) index, each leaf in one of three states:
 *        * complete — it has an actual finish; its actual dates stand;
 *        * in progress — an actual start and no finish; it resumes at the later of its actual
 *          start and the Data Date and runs its remaining duration from there. Unfinished
 *          predecessors do not drive it;
 *        * remaining — no actuals; it starts at the latest of the Data Date, the Project start
 *          and each predecessor's drive.
 *      Remaining duration is `ceil(duration × (1 − pct))`, at least 1, through `ceilDiv`; a
 *      missing pct is 0 and a remaining WP runs its full duration. It is derived, never stored.
 *   3. An actual date always wins (AR-58): when a WP's actual start precedes a predecessor's
 *      drive, its actual dates are kept and the pair is flagged out-of-sequence.
 *   4. A leaf with no duration gets no dates and is listed "not schedulable yet" (`no_duration`),
 *      never treated as 0 or 1. Its successors are bridged across it (Q4 → A):
 *      P →(a) X →(b) S drives S as P →(a+b) S, transitively, taking the latest drive.
 *   5. Summaries roll up from their descendant leaves (earliest start, latest finish, summed
 *      `plannedMh`). A pass never reads a roll-up back.
 *   6. A pass that leaves the calendar's range halts with `calendar_range` (FR-6b), naming the
 *      WPs (and anchors) and the side of the range they left by.
 *
 * Conventions (founder decisions, 2026-09-24):
 *   * Start and finish are inclusive working days. A WP of duration d > 0 starting on working day
 *     position s finishes on s + d − 1.
 *   * FS lag L starts the successor (1 + L) working days after the predecessor's finish: lag 0 is
 *     the next working day, −1 the finish day, −2 the day before (Q2). A predecessor's finish on
 *     a non-working day (an actual) counts from the last working day on or before it.
 *   * A zero-duration WP's date (start = finish) is its earliest start, and a lag-L successor
 *     starts L working days after that date (Q3 → A).
 *   * The Data Date and the Project start roll forward to the next working day (Q2).
 *
 * Outputs are keyed by `wpId` (AD-26's index-referenced encoding belongs to 2.9): WPs in
 * `compareWp` order, out-of-sequence pairs in (predecessor, successor) `compareWp` order. They are
 * identical under any shuffle of the WP and edge lists (AD-28).
 *
 * `prevInputs` stays in the signature (AD-25), but no per-WP cause is computed here (Q5 → A):
 * that is story 2.9's (`deferred-work.md`).
 *
 * Out of scope: late dates, Float and the critical path (2.6), constraints (2.7), the stored run
 * (2.9).
 *
 * Traceability: AD-25, AD-26, AD-27, AD-28, AR-7, AR-46, AR-49, AR-56, AR-58, FR-5, FR-6a, FR-6b.
 */
import {
  assertIsoDate,
  ceilPosition,
  floorPosition,
  workingDayAt,
  workingDayIndex,
  type CalendarVersion,
  type InRange,
  type IsoDate,
  type RangeSide,
  type WorkingDayIndex,
} from '../calendar';
import { ceilDiv, type Mh, type Ratio } from '../units';
import { canonicalWps } from './order';
import {
  hasOffences,
  validate,
  type EdgeRef,
  type GraphOffences,
  type PlanGraphEdge,
  type PlanGraphWp,
} from './validate';

// --- inputs ---------------------------------------------------------------------------------

/**
 * One WP as the scheduler reads it. Scheduling inputs on a summary are ignored: leafness comes
 * from the plan's own parent links, as in `validate`.
 */
export interface ScheduleWp extends PlanGraphWp {
  /** `work_package.duration_days`, in working days. `null` = not schedulable yet. */
  readonly durationDays: number | null;
  /** `work_package.planned_mh`. A summary's own value is never read; it is rolled up. */
  readonly plannedMh: Mh;
  /** The head `wp_status_event`'s actual dates. */
  readonly actualStart: IsoDate | null;
  readonly actualFinish: IsoDate | null;
  /** Recorded % Complete, in [0, 1]. `null` counts as 0. */
  readonly recordedPct: Ratio | null;
}

/** An FS dependency (`wp_dependency`) with its lag in working days, possibly negative. */
export interface ScheduleEdge extends PlanGraphEdge {
  readonly lagDays: number;
}

export interface ScheduleInputs {
  readonly projectId: string;
  /** Every WP of the Project, plus any foreign WP an edge names. Any order. */
  readonly wps: readonly ScheduleWp[];
  /** Any order. */
  readonly edges: readonly ScheduleEdge[];
  /** Non-null: the "no project start yet" gate belongs to the app layer. */
  readonly projectStart: IsoDate;
  readonly dataDate: IsoDate;
  readonly calendar: CalendarVersion;
}

// --- outputs --------------------------------------------------------------------------------

/** `wp_schedule.state`. `null` on a summary. */
export type ScheduleState = 'complete' | 'in_progress' | 'remaining';

/** `wp_schedule.not_schedulable_reason`. */
export type NotSchedulableReason = 'no_duration';

export interface WpScheduleOutput {
  readonly wpId: string;
  readonly state: ScheduleState | null;
  /** The derived early start and finish (a complete WP's actuals; a summary's roll-up). */
  readonly earlyStart: IsoDate | null;
  readonly earlyFinish: IsoDate | null;
  /** Working days left: 0 when complete, `null` on a summary or a WP with no duration. */
  readonly remainingDays: number | null;
  readonly notSchedulableReason: NotSchedulableReason | null;
  /** A leaf's own `plannedMh`; a summary's sum over its descendant leaves. */
  readonly plannedMh: Mh;
}

export interface NotSchedulable {
  readonly wpId: string;
  readonly reason: NotSchedulableReason;
}

export interface ScheduleOutputs {
  /** Every WP of the Project, in `compareWp` order. */
  readonly wps: readonly WpScheduleOutput[];
  /**
   * Pairs whose successor's actual start precedes the predecessor's drive, in (predecessor,
   * successor) `compareWp` order. The predecessor is the dated WP whose drive was violated,
   * reached across any no-duration WPs in between (bridging).
   */
  readonly outOfSequence: readonly EdgeRef[];
  /** The "not schedulable yet" leaves, in `compareWp` order. */
  readonly notSchedulable: readonly NotSchedulable[];
}

export type CalendarAnchor = 'data_date' | 'project_start';

export interface CalendarRangeHalt {
  readonly kind: 'halted';
  readonly reason: 'calendar_range';
  /** The Project dates that left the range, in the order `data_date`, `project_start`. */
  readonly anchors: readonly { readonly anchor: CalendarAnchor; readonly side: RangeSide }[];
  /** The WPs whose dates left the range, in `compareWp` order. */
  readonly wps: readonly { readonly wpId: string; readonly side: RangeSide }[];
}

export interface GraphInvalidHalt {
  readonly kind: 'halted';
  readonly reason: 'graph_invalid';
  readonly offences: GraphOffences;
}

export type ScheduleResult =
  | { readonly kind: 'scheduled'; readonly outputs: ScheduleOutputs }
  | GraphInvalidHalt
  | CalendarRangeHalt;

// --- the pass -------------------------------------------------------------------------------

/**
 * Derives every planned date of `inputs`. `prevInputs` is accepted for AD-25's signature and not
 * read (Q5 → A).
 *
 * Throws on a caller defect: a malformed date, a pct outside [0, 1], a negative or non-integer
 * duration or lag, an actual finish without an actual start or before it, and (through
 * `validate`) an edge to an unknown WP, a duplicate WP id or a parent-link loop.
 */
export function recalculate(
  inputs: ScheduleInputs,
  prevInputs: ScheduleInputs | null,
): ScheduleResult {
  void prevInputs;
  assertInputs(inputs);

  const offences = validate({ projectId: inputs.projectId, wps: inputs.wps }, inputs.edges);
  if (hasOffences(offences)) return { kind: 'halted', reason: 'graph_invalid', offences };

  const cal = workingDayIndex(inputs.calendar);
  const anchors = resolveAnchors(cal, inputs);
  if (!anchors.ok) {
    return { kind: 'halted', reason: 'calendar_range', anchors: anchors.offences, wps: [] };
  }

  const plan = buildPlan(inputs);
  const pass = forwardPass(plan, cal, anchors);
  if (pass.leftRange.length > 0) {
    const wps = [...pass.leftRange]
      .sort((a, b) => a.index - b.index)
      .map(({ index, side }) => ({ wpId: plan.wps[index]!.id, side }));
    return { kind: 'halted', reason: 'calendar_range', anchors: [], wps };
  }
  return { kind: 'scheduled', outputs: assemble(plan, pass) };
}

// --- input checks ---------------------------------------------------------------------------

function assertInputs(inputs: ScheduleInputs): void {
  assertIsoDate(inputs.projectStart, 'projectStart');
  assertIsoDate(inputs.dataDate, 'dataDate');
  for (const wp of inputs.wps) {
    const name = `recalculate: Work Package "${wp.id}"`;
    if (wp.durationDays !== null) assertDuration(wp.durationDays, name);
    assertPct(wp.recordedPct, name);
    if (wp.actualStart !== null) assertIsoDate(wp.actualStart, `${name} actualStart`);
    if (wp.actualFinish !== null) {
      assertIsoDate(wp.actualFinish, `${name} actualFinish`);
      if (wp.actualStart === null) {
        throw new RangeError(`${name} has an actual finish but no actual start`);
      }
      if (wp.actualFinish < wp.actualStart) {
        throw new RangeError(`${name} finishes (${wp.actualFinish}) before it starts (${wp.actualStart})`);
      }
    }
  }
  for (const edge of inputs.edges) {
    if (!Number.isSafeInteger(edge.lagDays)) {
      throw new RangeError(
        `recalculate: the edge "${edge.predecessorId}" → "${edge.successorId}" has lag ${edge.lagDays}, not a whole number of days`,
      );
    }
  }
}

/** Throws unless `durationDays` is a whole number of days ≥ 0. */
function assertDuration(durationDays: number, name: string): void {
  if (!(Number.isSafeInteger(durationDays) && durationDays >= 0)) {
    throw new RangeError(`${name} has duration ${durationDays}, not a whole number of days ≥ 0`);
  }
}

/** Throws unless `pct` is null or in [0, 1], with a non-zero denominator of either sign. */
function assertPct(pct: Ratio | null, name: string): void {
  if (pct === null) return;
  const { num, den } = pct;
  if (den === 0n) throw new RangeError(`${name} has a pct with a zero denominator`);
  // pct in [0, 1] ⟺ 0 ≤ num/den ≤ 1, for either sign of den.
  const inRange = den > 0n ? num >= 0n && num <= den : num <= 0n && num >= den;
  if (!inRange) throw new RangeError(`${name} has pct ${num}/${den}, outside [0, 1]`);
}

// --- anchors --------------------------------------------------------------------------------

interface Anchors {
  readonly ok: true;
  /** The rolled Data Date's position: where in-progress work resumes no earlier than. */
  readonly dataDate: number;
  /** The later of the rolled Data Date and the rolled Project start. */
  readonly earliestStart: number;
}

type AnchorResult = Anchors | { readonly ok: false; readonly offences: CalendarRangeHalt['anchors'] };

/**
 * Rolls the Data Date and the Project start forward. The Data Date must lie in range, and must
 * have a working day on or after it. A Project start before the range matters only when it is
 * later than the Data Date, which it then cannot be; so only a Project start that is later than
 * the Data Date and leaves the range halts.
 */
function resolveAnchors(cal: WorkingDayIndex, inputs: ScheduleInputs): AnchorResult {
  const offences: { anchor: CalendarAnchor; side: RangeSide }[] = [];
  const dataDate = rolledPosition(cal, inputs.dataDate);
  if (!dataDate.ok) offences.push({ anchor: 'data_date', side: dataDate.side });

  let projectStart: number | null = null;
  if (inputs.projectStart > inputs.dataDate) {
    const rolled = rolledPosition(cal, inputs.projectStart);
    if (rolled.ok) projectStart = rolled.value;
    else offences.push({ anchor: 'project_start', side: rolled.side });
  }
  // `!dataDate.ok` implies an offence; it is repeated only so TypeScript narrows `dataDate` below.
  if (offences.length > 0 || !dataDate.ok) return { ok: false, offences };
  return {
    ok: true,
    dataDate: dataDate.value,
    earliestStart: Math.max(dataDate.value, projectStart ?? dataDate.value),
  };
}

/** A date's rolled-forward working-day position, failing when there is none in range. */
function rolledPosition(cal: WorkingDayIndex, d: IsoDate): InRange<number> {
  const position = ceilPosition(cal, d);
  if (!position.ok) return position;
  return position.value < cal.days.length ? position : { ok: false, side: 'after' };
}

// --- the plan as the pass sees it -----------------------------------------------------------

interface Plan {
  /** The canonical WP list; every other reference is an index into it. */
  readonly wps: readonly ScheduleWp[];
  /** Whether each WP is a summary (some supplied WP's parent). */
  readonly isSummary: readonly boolean[];
  /** Whether each WP belongs to `inputs.projectId`: foreign WPs are not reported. */
  readonly isOwn: readonly boolean[];
  /** Incoming edges per WP, as (predecessor index, lag), in canonical predecessor order. */
  readonly incoming: readonly (readonly (readonly [number, number])[])[];
  /** Successor indices per WP, ascending, duplicates removed. */
  readonly successors: readonly (readonly number[])[];
  /** In-plan children per WP, ascending. */
  readonly children: readonly (readonly number[])[];
}

function buildPlan(inputs: ScheduleInputs): Plan {
  const { wps, indexOf } = canonicalWps(inputs.wps);
  const n = wps.length;
  const isSummary = new Array<boolean>(n).fill(false);
  const children: number[][] = Array.from({ length: n }, () => []);
  wps.forEach((wp, i) => {
    const parent = wp.parentId === null || wp.parentId === undefined ? undefined : indexOf.get(wp.parentId);
    if (parent !== undefined) {
      isSummary[parent] = true;
      children[parent]!.push(i);
    }
  });

  const incoming: [number, number][][] = Array.from({ length: n }, () => []);
  const successors: number[][] = Array.from({ length: n }, () => []);
  // `validate` has already refused any edge to an unknown WP.
  const pairs = inputs.edges
    .map((edge) => [indexOf.get(edge.predecessorId)!, indexOf.get(edge.successorId)!, edge.lagDays] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [p, s, lag] of pairs) {
    incoming[s]!.push([p, lag]);
    const out = successors[p]!;
    if (out[out.length - 1] !== s) out.push(s);
  }
  return {
    wps,
    isSummary,
    isOwn: wps.map((wp) => wp.projectId === inputs.projectId),
    incoming,
    successors,
    children,
  };
}

/**
 * Kahn's algorithm with the ready set kept as a min-heap of canonical indices, so the order is
 * a function of the plan alone. `validate` has refused every cycle, so every WP is reached.
 */
function topologicalOrder(plan: Plan): number[] {
  const n = plan.wps.length;
  const pending = new Array<number>(n).fill(0);
  for (let s = 0; s < n; s++) {
    // Count distinct predecessors: `successors` is de-duplicated, so indegree must match it.
    pending[s] = new Set(plan.incoming[s]!.map(([p]) => p)).size;
  }
  const heap = new MinHeap();
  for (let i = 0; i < n; i++) if (pending[i] === 0) heap.push(i);
  const order: number[] = [];
  while (heap.size > 0) {
    const u = heap.pop();
    order.push(u);
    for (const s of plan.successors[u]!) {
      pending[s] = pending[s]! - 1;
      if (pending[s] === 0) heap.push(s);
    }
  }
  return order;
}

class MinHeap {
  private readonly items: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: number): void {
    const items = this.items;
    items.push(value);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]! <= value) break;
      items[i] = items[parent]!;
      i = parent;
    }
    items[i] = value;
  }

  pop(): number {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= items.length) break;
        const right = left + 1;
        const child = right < items.length && items[right]! < items[left]! ? right : left;
        if (items[child]! >= last) break;
        items[i] = items[child]!;
        i = child;
      }
      items[i] = last;
    }
    return top;
  }
}

// --- the forward pass -----------------------------------------------------------------------

interface LeafResult {
  readonly state: ScheduleState;
  readonly earlyStart: IsoDate | null;
  readonly earlyFinish: IsoDate | null;
  readonly remainingDays: number | null;
  readonly notSchedulable: boolean;
}

interface Pass {
  /** Per canonical index; `undefined` for a summary, or a leaf the pass did not reach. */
  readonly leaves: readonly (LeafResult | undefined)[];
  /** (predecessor, successor) index pairs, unsorted, possibly repeated. */
  readonly outOfSequence: readonly (readonly [number, number])[];
  readonly leftRange: readonly { readonly index: number; readonly side: RangeSide }[];
}

/**
 * Per WP, the drives it passes on: dated predecessor index → the working-day position a lag-0
 * successor would start at. A dated WP passes on only itself; a no-duration WP passes on the
 * drives it received (the bridge), so a lag on the way out adds to the lag on the way in.
 */
type Drives = Map<number, number>;

function forwardPass(plan: Plan, cal: WorkingDayIndex, anchors: Anchors): Pass {
  const n = plan.wps.length;
  const leaves: (LeafResult | undefined)[] = new Array<LeafResult | undefined>(n).fill(undefined);
  const outgoing: (Drives | undefined)[] = new Array<Drives | undefined>(n).fill(undefined);
  const blocked = new Array<boolean>(n).fill(false);
  const outOfSequence: [number, number][] = [];
  const leftRange: { index: number; side: RangeSide }[] = [];

  for (const i of topologicalOrder(plan)) {
    if (plan.isSummary[i]) continue; // `validate` has refused any edge touching a summary.
    // A foreign WP is never reported, so it must never halt the run. `validate` has refused any
    // edge touching one, so nothing depends on it.
    if (!plan.isOwn[i]) continue;
    // A WP downstream of one that left the range cannot be evaluated; the run halts anyway.
    if (plan.incoming[i]!.some(([p]) => blocked[p])) {
      blocked[i] = true;
      continue;
    }
    const received = incomingDrives(plan, outgoing, i);
    const step = scheduleLeaf(plan.wps[i]!, received, cal, anchors, plan.successors[i]!.length > 0);
    if (!step.ok) {
      blocked[i] = true;
      leftRange.push({ index: i, side: step.side });
      continue;
    }
    leaves[i] = step.leaf;
    outgoing[i] = step.passOn === null ? received : new Map([[i, step.passOn]]);
    if (step.actualStartFloor !== null) {
      for (const [p, drive] of received) {
        if (step.actualStartFloor < drive) outOfSequence.push([p, i]);
      }
    }
  }
  return { leaves, outOfSequence, leftRange };
}

/** The latest drive per dated predecessor, reached directly or bridged. */
function incomingDrives(plan: Plan, outgoing: readonly (Drives | undefined)[], i: number): Drives {
  const received: Drives = new Map();
  for (const [p, lag] of plan.incoming[i]!) {
    for (const [source, drive] of outgoing[p]!) {
      const candidate = drive + lag;
      const current = received.get(source);
      if (current === undefined || candidate > current) received.set(source, candidate);
    }
  }
  return received;
}

type LeafStep =
  | {
      readonly ok: true;
      readonly leaf: LeafResult;
      /** The position a lag-0 successor starts at; `null` = bridge the received drives. */
      readonly passOn: number | null;
      /** The floor position of an actual start, for the out-of-sequence check. */
      readonly actualStartFloor: number | null;
    }
  | { readonly ok: false; readonly side: RangeSide };

function scheduleLeaf(
  wp: ScheduleWp,
  received: Drives,
  cal: WorkingDayIndex,
  anchors: Anchors,
  hasSuccessors: boolean,
): LeafStep {
  const state: ScheduleState =
    wp.actualFinish !== null ? 'complete' : wp.actualStart !== null ? 'in_progress' : 'remaining';

  // An actual start is compared against every received drive: "an actual date always wins".
  let actualStartFloor: number | null = null;
  if (wp.actualStart !== null && received.size > 0) {
    const floor = floorPosition(cal, wp.actualStart);
    if (floor.ok) {
      actualStartFloor = floor.value;
    } else if (floor.side === 'before') {
      // Before the range, so before every drive inside it: −1 flags each drive ≥ 0. A drive that
      // itself lies before the range cannot be compared without days the calendar lacks.
      for (const drive of received.values()) if (drive < 0) return floor;
      actualStartFloor = -1;
    } else {
      return floor;
    }
  }

  if (state === 'complete') {
    let passOn = 0;
    if (hasSuccessors) {
      // A milestone's date is where a lag-0 successor starts (Q3); otherwise the next working day.
      const finish =
        wp.durationDays === 0 ? ceilPosition(cal, wp.actualFinish!) : floorPosition(cal, wp.actualFinish!);
      if (!finish.ok) return finish;
      passOn = wp.durationDays === 0 ? finish.value : finish.value + 1;
    }
    return {
      ok: true,
      leaf: {
        state,
        earlyStart: wp.actualStart,
        earlyFinish: wp.actualFinish,
        remainingDays: 0,
        notSchedulable: false,
      },
      passOn,
      actualStartFloor,
    };
  }

  if (wp.durationDays === null) {
    // An actual start still stands ("an actual date always wins"); only the finish is unknown.
    const leaf = {
      state,
      earlyStart: wp.actualStart,
      earlyFinish: null,
      remainingDays: null,
      notSchedulable: true,
    };
    return { ok: true, leaf, passOn: null, actualStartFloor };
  }

  let start: number;
  let days: number;
  if (state === 'in_progress') {
    const actualStart = ceilPosition(cal, wp.actualStart!);
    if (actualStart.ok) start = Math.max(actualStart.value, anchors.dataDate);
    // Started before the range: it resumes at the Data Date, which is always in range.
    else if (actualStart.side === 'before') start = anchors.dataDate;
    else return actualStart;
    days = remainingDuration(wp.durationDays, wp.recordedPct);
  } else {
    start = anchors.earliestStart;
    for (const drive of received.values()) if (drive > start) start = drive;
    days = wp.durationDays;
  }

  // A zero-duration WP occupies its start day: start = finish (Q3).
  const finish = days === 0 ? start : start + days - 1;
  const startDate = workingDayAt(cal, start);
  if (!startDate.ok) return startDate;
  const finishDate = workingDayAt(cal, finish);
  if (!finishDate.ok) return finishDate;
  return {
    ok: true,
    leaf: {
      state,
      // An in-progress WP's start is its actual start; only its finish is derived.
      earlyStart: state === 'in_progress' ? wp.actualStart : startDate.value,
      earlyFinish: finishDate.value,
      remainingDays: days,
      notSchedulable: false,
    },
    passOn: days === 0 ? finish : finish + 1,
    actualStartFloor,
  };
}

/**
 * `ceil(duration × (1 − pct))`, at least 1, through `ceilDiv` (AD-27). A missing pct is 0. A
 * zero-duration WP stays at 0: the minimum is for work, and a milestone has none.
 */
export function remainingDuration(durationDays: number, pct: Ratio | null): number {
  assertDuration(durationDays, 'remainingDuration:');
  assertPct(pct, 'remainingDuration:');
  if (durationDays === 0) return 0;
  if (pct === null) return durationDays;
  const left = ceilDiv(BigInt(durationDays) * (pct.den - pct.num), pct.den);
  return left < 1n ? 1 : Number(left);
}

// --- assembly -------------------------------------------------------------------------------

function assemble(plan: Plan, pass: Pass): ScheduleOutputs {
  const rolled = rollUp(plan, pass);
  const wps: WpScheduleOutput[] = [];
  const notSchedulable: NotSchedulable[] = [];
  plan.wps.forEach((wp, i) => {
    if (!plan.isOwn[i]) return;
    if (plan.isSummary[i]) {
      const r = rolled[i]!;
      wps.push({
        wpId: wp.id,
        state: null,
        earlyStart: r.start,
        earlyFinish: r.finish,
        remainingDays: null,
        notSchedulableReason: null,
        plannedMh: r.plannedMh,
      });
      return;
    }
    const leaf = pass.leaves[i]!;
    if (leaf.notSchedulable) notSchedulable.push({ wpId: wp.id, reason: 'no_duration' });
    wps.push({
      wpId: wp.id,
      state: leaf.state,
      earlyStart: leaf.earlyStart,
      earlyFinish: leaf.earlyFinish,
      remainingDays: leaf.remainingDays,
      notSchedulableReason: leaf.notSchedulable ? 'no_duration' : null,
      plannedMh: wp.plannedMh,
    });
  });

  const seen = new Set<string>();
  const outOfSequence: EdgeRef[] = [];
  for (const [p, s] of [...pass.outOfSequence].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const key = `${p}:${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outOfSequence.push({ predecessorId: plan.wps[p]!.id, successorId: plan.wps[s]!.id });
  }
  return { wps, outOfSequence, notSchedulable };
}

interface RollUp {
  readonly start: IsoDate | null;
  readonly finish: IsoDate | null;
  readonly plannedMh: Mh;
}

/**
 * Each WP's roll-up over its descendant leaves: the earliest early start, the latest early
 * finish (null when no descendant is dated) and the summed `plannedMh`. Children are visited
 * before parents (an explicit post-order), so a deep tree cannot exhaust the call stack.
 */
function rollUp(plan: Plan, pass: Pass): (RollUp | undefined)[] {
  const n = plan.wps.length;
  const out = new Array<RollUp | undefined>(n).fill(undefined);
  const isChild = new Array<boolean>(n).fill(false);
  for (const list of plan.children) for (const c of list) isChild[c] = true;

  for (let root = 0; root < n; root++) {
    if (isChild[root]) continue;
    const frames: [number, number][] = [[root, 0]];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const [v, next] = frame;
      const kids = plan.children[v]!;
      if (next < kids.length) {
        frame[1] = next + 1;
        frames.push([kids[next]!, 0]);
        continue;
      }
      frames.pop();
      out[v] = plan.isSummary[v] ? combine(kids.map((c) => out[c]!)) : leafRollUp(plan, pass, v);
    }
  }
  return out;
}

function leafRollUp(plan: Plan, pass: Pass, i: number): RollUp {
  const leaf = pass.leaves[i];
  return {
    start: leaf?.earlyStart ?? null,
    finish: leaf?.earlyFinish ?? null,
    plannedMh: plan.wps[i]!.plannedMh,
  };
}

function combine(parts: readonly RollUp[]): RollUp {
  let start: IsoDate | null = null;
  let finish: IsoDate | null = null;
  let plannedMh = 0n;
  for (const part of parts) {
    if (part.start !== null && (start === null || part.start < start)) start = part.start;
    if (part.finish !== null && (finish === null || part.finish > finish)) finish = part.finish;
    plannedMh += part.plannedMh;
  }
  return { start, finish, plannedMh };
}
