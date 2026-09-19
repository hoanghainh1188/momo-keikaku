import type { IsoDate } from './calendar';
import type { Mh } from './units';

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
  /** FR-12: dated Rate history. */
  rates: { effectiveFrom: IsoDate; yenPerHour: number }[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  clientName: string;
  contractType: '請負' | '準委任';
  tzOffsetMinutes: number;
  teireiWeekday: number;
  defaultRateYenPerHour: number;
  eacMethod: 'typical';
  thresholds: {
    ratioGreen: number; // >= green
    ratioAmber: number; // >= amber, below = red
    tcpiRed: number;
    unplannedGreenBelow: number; // share
    unplannedAmberMax: number;
  };
}

export const DEFAULT_THRESHOLDS: ProjectConfig['thresholds'] = {
  ratioGreen: 0.95,
  ratioAmber: 0.85,
  tcpiRed: 1.1,
  unplannedGreenBelow: 0.1,
  unplannedAmberMax: 0.2,
};
