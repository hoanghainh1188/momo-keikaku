import type { IsoDate } from './calendar';
import type { Jpy, Mh, Ratio } from './units';

/** AD-6: the FR-19 whitelist. Descriptions and comments are never carried. */
export interface TicketObservation {
  trackerIssueId: string;
  key: string;
  title: string;
  statusId: string;
  resolved: boolean;
  estimateMh: Mh | null;
  actualMh: Mh | null;
  assigneeAccountId: string | null;
  issueTypeId: string;
  categoryIds: string[];
  milestoneIds: string[];
  createdAt: string; // instant, for FR-42 opening-balance classification
}

export interface SnapshotRead {
  /** AD-15: adapter-supplied observation time, not the wall clock. */
  observedAt: string;
  hoursFieldPresent: boolean;
  tickets: TicketObservation[];
}

export type LedgerEntryKind = 'opening_balance' | 'delta';

export interface LedgerEntry {
  seq: number;
  ticketId: string; // trackerIssueId
  kind: LedgerEntryKind;
  deltaMh: Mh;
  windowStart: string | null;
  windowEnd: string;
  assigneeAccountId: string | null;
  /**
   * AD-7 + adversarial review H3: the Baseline active at INGEST, identified by
   * sequence, never by comparing timestamps against fixture `observedAt`.
   */
  activeBaselineVersionSeq: number | null;
}

export type MappingSource = 'manual' | 'rule' | 'disposition';

export interface MappingEvent {
  seq: number;
  ticketId: string;
  wpId: string | null;
  source: MappingSource;
  ruleId?: string | null;
  at: string;
  actor: string;
}

export interface MappingRule {
  id: string;
  priority: number; // strict order, lowest wins
  name: string;
  wpId: string;
  /** Demo supports the Backlog attribute set from FR-22. */
  match:
    | { field: 'milestone'; value: string }
    | { field: 'category'; value: string }
    | { field: 'issueType'; value: string }
    | { field: 'keyPrefix'; value: string };
}

export interface WorkPackage {
  id: string;
  wbsCode: string;
  name: string;
  parentId: string | null;
  isLeaf: boolean;
  isMilestone: boolean;
  isCatchAll: boolean;
  start: IsoDate | null;
  finish: IsoDate | null;
  plannedMh: Mh; // Current Plan
  completedAt: string | null;
  milestoneDoneAt: IsoDate | null;
  assignedResourceIds: string[];
}

export interface BaselineWp {
  wpId: string;
  start: IsoDate;
  finish: IsoDate;
  baselineMh: Mh;
  isMilestone: boolean;
}

export interface BaselineVersion {
  seq: number;
  id: string;
  reason: string;
  recordedAt: string;
  wps: BaselineWp[];
}

export interface Resource {
  id: string;
  name: string;
  departmentId: string;
  trackerAccountIds: string[];
  /**
   * FR-12: dated Rate history. `seq` is the append-only watermark (story 1.6); a pinned lookup
   * keeps only rows with `seq ≤ rate_seq_max`.
   */
  rates: RateEntry[];
}

/** One dated Rate row — Resource Rates and Project default Rate history share this shape. */
export interface RateEntry {
  seq: number;
  effectiveFrom: IsoDate;
  yenPerHour: Jpy;
}

/**
 * Optional seq ceilings for a live vs. Published Snapshot valuation (story 1.6 / Epic 5). Omit a
 * pin to use every row (live view); with a pin, only rows at or below it count.
 */
export interface RatePins {
  readonly rateSeqMax?: number;
  readonly projectDefaultRateSeqMax?: number;
}

export interface ProjectConfig {
  id: string;
  name: string;
  clientName: string;
  contractType: '請負' | '準委任';
  tzOffsetMinutes: number;
  teireiWeekday: number;
  /** Live unpinned default — the dual-write cache of `project_default_rate_entry`'s head. */
  defaultRateYenPerHour: Jpy;
  eacMethod: 'typical';
  /**
   * AD-4: thresholds are exact `Ratio` constants, met only through `compareRatio` in
   * `health.ts` — `spi ≥ 0.95` is `num × 100 ≥ den × 95`, never a float comparison.
   */
  thresholds: {
    ratioGreen: Ratio; // >= green
    ratioAmber: Ratio; // >= amber, below = red
    tcpiRed: Ratio;
    unplannedGreenBelow: Ratio; // share
    unplannedAmberMax: Ratio;
  };
}

export const DEFAULT_THRESHOLDS: ProjectConfig['thresholds'] = {
  ratioGreen: { num: 95n, den: 100n },
  ratioAmber: { num: 85n, den: 100n },
  tcpiRed: { num: 11n, den: 10n },
  unplannedGreenBelow: { num: 1n, den: 10n },
  unplannedAmberMax: { num: 2n, den: 10n },
};
