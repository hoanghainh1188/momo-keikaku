import type { MappingRuleField } from '@momo/domain';
import type { AuditSink } from '../audit';
import type { AuditedWriteDeps, WriteStamp } from './audited-write';
import type { IdGenerator } from './ids';

/**
 * The port the Mapping Rule writes depend on (story 5.10 / FR-22) — create, edit, delete and
 * reorder, each followed by a re-evaluation of the Project's Tickets in the SAME transaction.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY by `packages/db/src/repo-mapping-rules.ts`, exactly like
 * `ProjectWriteRepository`: `packages/db` may not import `@momo/app`, and each composition root's
 * `satisfies WriteDeps<Db>` checks the match.
 *
 * `lockProject` takes the per-Project watermark lock (AR-37) and is called FIRST, so every read
 * that decides the write — the priority check, the live rule list, the heads the re-evaluation
 * reads — happens under the lock: a manual Mapping committed before the save is seen and wins,
 * and one committed after waits.
 *
 * NO MEMBER WRITES A DATE OR RECALCULATES (FR-22 / AR-52): rules change attribution only.
 */

export type RuleTargetKind = 'leaf' | 'not_leaf' | 'absent';

/** A live rule, as stored. For `parent` the value is the parent's tracker issue id. */
export interface MappingRuleRecord {
  readonly id: string;
  readonly priority: number;
  readonly name: string;
  readonly wpId: string;
  readonly matchField: MappingRuleField;
  readonly matchValue: string;
}

export interface MappingRuleRowCommand extends MappingRuleRecord {
  readonly projectId: string;
}

export interface MappingRuleWriteRepository {
  /** The Project's event time; rejects with the not-found wording for an invisible Project. */
  readonly projectAnchor: (projectId: string) => Promise<Date>;
  readonly lockProject: (projectId: string) => Promise<void>;
  /** `leaf` = live, leaf, non-milestone WP of the Project; `absent` = no live WP of the Project. */
  readonly ruleTargetOf: (projectId: string, wpId: string) => Promise<RuleTargetKind>;
  /** A parent key the PM typed → the Ticket's tracker issue id, or null when unknown. */
  readonly ticketIdForKey: (projectId: string, key: string) => Promise<string | null>;
  /** The Project's live rules, priority order. */
  readonly liveRules: (projectId: string) => Promise<readonly MappingRuleRecord[]>;
  readonly insertRule: (command: MappingRuleRowCommand) => Promise<void>;
  readonly updateRule: (command: MappingRuleRowCommand) => Promise<void>;
  readonly softDeleteRule: (stamp: WriteStamp, projectId: string, ruleId: string) => Promise<void>;
  /** Live priorities become 1..n in this order. */
  readonly renumberRules: (projectId: string, orderedIds: readonly string[]) => Promise<void>;
  /** Re-evaluates every in-scope Ticket; appends only on change. Returns how many moved. */
  readonly reevaluate: (stamp: WriteStamp, projectId: string) => Promise<{ readonly moved: number }>;
}

export interface MappingRuleWriteScope {
  readonly mappingRules: MappingRuleWriteRepository;
  readonly audit: AuditSink;
}

export type MappingRuleWriteDeps<Handle> = AuditedWriteDeps<Handle, MappingRuleWriteScope> & {
  /** A new rule's id (AD-15's id port). */
  readonly ids: IdGenerator;
};
