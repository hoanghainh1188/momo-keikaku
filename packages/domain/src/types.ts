import type { IsoDate } from './calendar';
import type { Jpy, Mh, Ratio } from './units';

/**
 * AD-6: closed attribute kinds for Backlog in R0. Jira Post-Q1 adds its own closed set
 * (`label` | `component` | `fixVersion` | `epic`) without migrating the ledger.
 */
export type BacklogAttributeKind = 'milestone' | 'category';

/** Per-Tracker attribute kinds. R0 only names Backlog's; the observation carries the closed set. */
export type TicketAttributeKind = BacklogAttributeKind;

/** One mapping attribute on a TicketObservation (AD-6). */
export interface TicketAttribute {
  kind: TicketAttributeKind;
  id: string;
  label?: string;
}

/**
 * AD-6: the FR-19 whitelist plus `createdAt`. Descriptions and comments are never carried.
 * The adapter reports `statusId` only — "Resolved" is Connector configuration at compute time.
 */
export interface TicketObservation {
  trackerIssueId: string;
  key: string;
  title: string;
  statusId: string;
  estimateMh: Mh | null;
  actualMh: Mh | null;
  assigneeAccountId: string | null;
  createdAt: string; // instant, for FR-42 opening-balance classification
  parentIssueId: string | null;
  issueTypeId: string;
  trackerProjectId: string | null;
  attributes: TicketAttribute[];
}

/** AD-6: the only source of `tracker_account` identity rows. */
export interface TrackerAccountObservation {
  accountId: string;
  displayName: string;
  email?: string;
}

/** AD-6 adapter kinds recorded on every snapshot. */
export type AdapterKind = 'fixture' | 'backlog';

/** Rate-limit signal from an HTTP tracker (scaffold for 5.3). */
export interface RateLimitState {
  remaining: number | null;
  resetAt: string | null;
}

export interface SnapshotRead {
  /** AD-15: adapter-supplied observation time, not the wall clock. */
  observedAt: string;
  hoursFieldPresent: boolean;
  tickets: TicketObservation[];
  /** AD-6: present on TrackerPort reads; optional on older in-memory demo shapes until filled. */
  complete?: boolean;
  accounts?: TrackerAccountObservation[];
  rateLimit?: RateLimitState | null;
  adapterKind?: AdapterKind;
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
  /** Demo supports the Backlog attribute set from FR-22 — values match `attributes[].id`. */
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
  plannedMh: Mh; // Current Plan
  /**
   * AD-25: the WP's actual dates, read from its head `wp_status_event` (the highest `seq`). A WP
   * carries no planned date: planned dates are the scheduler's output, and every planned date the
   * domain reads today comes from the active Baseline's `baseline_wp` rows.
   *
   * `actualFinish` on a leaf that is not a milestone is "marked complete" (it lifts FR-30's 99%
   * cap); on a milestone it is "milestone done".
   */
  actualStart: IsoDate | null;
  actualFinish: IsoDate | null;
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
  /** Author of this version (`audit` actor form). DB column already stored; exposed for FR-16 history. */
  actor: string;
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
  /**
   * Story 5.8: ceiling for `tracker_account_link_event`. Omit = live head; set = pinned
   * (Published Snapshots later). Resources fed to attribution must already reflect this pin.
   */
  readonly linkSeqMax?: number;
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

/**
 * Seed default Resolved set for `connector_setting_event` on Connector create (Story 5.7).
 * Compute paths take the pinned setting head; this is the seed / missing-head fallback only.
 */
export const DEFAULT_RESOLVED_STATUS_IDS: ReadonlySet<string> = new Set(['Closed']);

/** True when the observation's status is in the Connector's Resolved set (AD-6). */
export function isResolvedStatus(
  statusId: string,
  resolvedStatusIds: ReadonlySet<string>,
): boolean {
  return resolvedStatusIds.has(statusId);
}
