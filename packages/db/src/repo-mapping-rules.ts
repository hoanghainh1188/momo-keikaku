import {
  applyRules,
  type MappingHeadEntry,
  type MappingRule,
  type Mh,
  type TicketAttribute,
  type TicketObservation,
} from '@momo/domain';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Bound } from './bound';
import type { Db } from './client';
import { projectNotFound } from './project-not-found';
import { appendMappingEvents, type MappingEventSource, type WriteStamp } from './repo-writes';
import * as s from './schema';
import { lockWatermark } from './watermark-lock';
import { withTenant, type Tx } from './with-tenant';

/**
 * Story 5.10 — Mapping Rules, authored by the PM (FR-22, AR-18, UX-DR22).
 *
 * TWO HALVES, ONE EVALUATION. `loadRuleEvaluationOn` reads everything a rule evaluation needs —
 * the live rules, the latest observation of every in-scope Ticket, the current Mapping heads and
 * the Tickets' cumulative ledger hours — and BOTH the read-only move preview (`loadRuleEvaluation`,
 * a tenant read) and every rule save (`reevaluate`, inside the write transaction, after the
 * per-Project lock) run the domain's pure `applyRules` over it. So the preview cannot promise a
 * move the save does not make.
 *
 * MANUAL WINS (AR-18 / AR-37). `reevaluate` takes the Project watermark lock BEFORE it reads the
 * heads, so a manual Mapping that committed first is seen and skipped, and one that arrives later
 * waits for this transaction. Heads are computed from `mapping_event` (the only Mapping store),
 * never from the derived `mapping_head` index.
 *
 * NO PLAN MOTION (FR-22 / AR-52). Nothing here writes a Work Package date or calls the schedule.
 *
 * Satisfies `packages/app`'s `MappingRuleWriteRepository` structurally, like every write family.
 */

export type RuleTargetKind = 'leaf' | 'not_leaf' | 'absent';

/** A live rule row as the use cases read it. */
export interface MappingRuleRecord {
  readonly id: string;
  readonly priority: number;
  readonly name: string;
  readonly wpId: string;
  readonly matchField: MappingRule['match']['field'];
  readonly matchValue: string;
}

export interface MappingRuleRowCommand {
  readonly projectId: string;
  readonly id: string;
  readonly priority: number;
  readonly name: string;
  readonly wpId: string;
  readonly matchField: MappingRule['match']['field'];
  readonly matchValue: string;
}

/** Everything one rule evaluation reads, for one Project. */
export interface RuleEvaluationInputs {
  /** Live rules, priority order. */
  readonly rules: MappingRule[];
  /** The latest observation of every in-scope (not left-scope) Ticket, tracker issue id order. */
  readonly tickets: TicketObservation[];
  /** Current Mapping heads from `mapping_event`, by tracker issue id. */
  readonly head: ReadonlyMap<string, MappingHeadEntry>;
  /** Cumulative ledger hours per Ticket, from hours Connectors only (Ticket-Count: none). */
  readonly hoursByTicket: ReadonlyMap<string, Mh>;
  /** Whether any Connector of the Project is on an hours basis (Ticket-Count Mode: false). */
  readonly hoursAvailable: boolean;
  /** Every Ticket identity of the Project by key — what a `parent` key resolves through. */
  readonly ticketIdsByKey: ReadonlyMap<string, string>;
  /** Live Work Packages of the Project, and whether each is a mappable leaf. */
  readonly wpKinds: ReadonlyMap<string, Exclude<RuleTargetKind, 'absent'>>;
}

function toRule(r: typeof s.mappingRule.$inferSelect): MappingRule {
  return {
    id: r.id,
    priority: r.priority,
    name: r.name,
    wpId: r.wpId,
    match: { field: r.matchField, value: r.matchValue } as MappingRule['match'],
  };
}

function toRecord(r: typeof s.mappingRule.$inferSelect): MappingRuleRecord {
  return {
    id: r.id,
    priority: r.priority,
    name: r.name,
    wpId: r.wpId,
    matchField: r.matchField as MappingRule['match']['field'],
    matchValue: r.matchValue,
  };
}

async function liveRuleRows(tx: Tx, tenantId: string, projectId: string) {
  return tx
    .select()
    .from(s.mappingRule)
    .where(
      and(
        eq(s.mappingRule.tenantId, tenantId),
        eq(s.mappingRule.projectId, projectId),
        isNull(s.mappingRule.deletedAt),
      ),
    )
    .orderBy(asc(s.mappingRule.priority), asc(s.mappingRule.id));
}

/** Live rules of a Project, priority order — what ingest and every rule save evaluate. */
export async function loadLiveMappingRules(
  tx: Tx,
  tenantId: string,
  projectId: string,
): Promise<MappingRule[]> {
  return (await liveRuleRows(tx, tenantId, projectId)).map(toRule);
}

type ObservationRow = {
  tracker_issue_id: string;
  key: string;
  title: string;
  status_id: string;
  estimate_mh: string | null;
  actual_mh: string | null;
  assignee_account_id: string | null;
  created_at: Date | string;
  parent_issue_id: string | null;
  issue_type_id: string;
  tracker_project_id: string | null;
  attributes: unknown;
};

/** The latest observation (by snapshot `seq`, owner Connector) of each in-scope Ticket. */
async function latestObservations(tx: Tx, tenantId: string, projectId: string) {
  const res = await tx.execute<ObservationRow>(sql`
    SELECT DISTINCT ON (o.tracker_issue_id)
      o.tracker_issue_id, o.key, o.title, o.status_id, o.estimate_mh::text AS estimate_mh,
      o.actual_mh::text AS actual_mh, o.assignee_account_id, o.created_at, o.parent_issue_id,
      o.issue_type_id, o.tracker_project_id, o.attributes
    FROM ticket t
    JOIN tracker_snapshot sn
      ON sn.tenant_id = t.tenant_id AND sn.connector_id = t.owner_connector_id
    JOIN ticket_observation o
      ON o.tenant_id = sn.tenant_id AND o.snapshot_id = sn.id AND o.tracker_issue_id = t.tracker_issue_id
    WHERE t.tenant_id = ${tenantId} AND t.project_id = ${projectId} AND t.left_scope = false
    ORDER BY o.tracker_issue_id, sn.seq DESC
  `);
  return res.rows.map(
    (o): TicketObservation => ({
      trackerIssueId: o.tracker_issue_id,
      key: o.key,
      title: o.title,
      statusId: o.status_id,
      estimateMh: o.estimate_mh === null ? null : BigInt(o.estimate_mh),
      actualMh: o.actual_mh === null ? null : BigInt(o.actual_mh),
      assigneeAccountId: o.assignee_account_id,
      createdAt: new Date(o.created_at).toISOString(),
      parentIssueId: o.parent_issue_id,
      issueTypeId: o.issue_type_id,
      trackerProjectId: o.tracker_project_id,
      attributes: (o.attributes ?? []) as TicketAttribute[],
    }),
  );
}

type HeadRow = {
  ticket_id: string;
  wp_id: string | null;
  source: string;
  rule_id: string | null;
  seq: string | number;
};

/** The current head of every Ticket, from the event log (latest `seq` wins). */
async function headsFromEvents(
  tx: Tx,
  tenantId: string,
  projectId: string,
): Promise<Map<string, MappingHeadEntry>> {
  const res = await tx.execute<HeadRow>(sql`
    SELECT DISTINCT ON (ticket_id) ticket_id, wp_id, source, rule_id, seq
    FROM mapping_event
    WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
    ORDER BY ticket_id, seq DESC
  `);
  return new Map(
    res.rows.map((r) => [
      r.ticket_id,
      {
        wpId: r.wp_id,
        source: r.source as MappingEventSource,
        seq: Number(r.seq),
        ruleId: r.rule_id,
      },
    ]),
  );
}

/** Cumulative ledger hours per Ticket over the Project's hours-basis Connectors (AD-8). */
async function hoursByTicket(
  tx: Tx,
  tenantId: string,
  projectId: string,
): Promise<{ readonly byTicket: Map<string, Mh>; readonly available: boolean }> {
  const connectors = await tx
    .select({ id: s.connector.id })
    .from(s.connector)
    .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.projectId, projectId)));
  const out = new Map<string, Mh>();
  let available = false;
  for (const c of connectors) {
    const [basis] = await tx
      .select({ basis: s.measurementBasisEvent.basis })
      .from(s.measurementBasisEvent)
      .where(
        and(
          eq(s.measurementBasisEvent.tenantId, tenantId),
          eq(s.measurementBasisEvent.connectorId, c.id),
        ),
      )
      .orderBy(desc(s.measurementBasisEvent.seq))
      .limit(1);
    // A missing head is `count` (story 5.7): a Ticket-Count Connector contributes no hours.
    if (basis?.basis !== 'hours') continue;
    available = true;
    const sums = await tx
      .select({
        ticketId: s.actualsLedgerEntry.ticketId,
        mh: sql<string>`sum(${s.actualsLedgerEntry.deltaMh})::text`,
      })
      .from(s.actualsLedgerEntry)
      .where(
        and(
          eq(s.actualsLedgerEntry.tenantId, tenantId),
          eq(s.actualsLedgerEntry.connectorId, c.id),
        ),
      )
      .groupBy(s.actualsLedgerEntry.ticketId);
    for (const row of sums) {
      out.set(row.ticketId, (out.get(row.ticketId) ?? 0n) + BigInt(row.mh));
    }
  }
  return { byTicket: out, available };
}

/**
 * Key → tracker issue id, keeping the FIRST (lowest id) Ticket per key — the same choice as
 * `ticketIdForKey`, so the preview and the save resolve a `parent` key to the same Ticket.
 */
function firstIdByKey(
  identities: readonly { readonly key: string; readonly trackerIssueId: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of identities) if (!out.has(t.key)) out.set(t.key, t.trackerIssueId);
  return out;
}

/** Everything one rule evaluation reads. Call under the Project lock when the result is written. */
export async function loadRuleEvaluationOn(
  tx: Tx,
  tenantId: string,
  projectId: string,
): Promise<RuleEvaluationInputs> {
  const rules = await loadLiveMappingRules(tx, tenantId, projectId);
  const tickets = await latestObservations(tx, tenantId, projectId);
  const head = await headsFromEvents(tx, tenantId, projectId);
  const hours = await hoursByTicket(tx, tenantId, projectId);
  const identities = await tx
    .select({ key: s.ticket.key, trackerIssueId: s.ticket.trackerIssueId })
    .from(s.ticket)
    .where(and(eq(s.ticket.tenantId, tenantId), eq(s.ticket.projectId, projectId)))
    .orderBy(asc(s.ticket.trackerIssueId));
  const wps = await tx
    .select({
      id: s.workPackage.id,
      isLeaf: s.workPackage.isLeaf,
      isMilestone: s.workPackage.isMilestone,
    })
    .from(s.workPackage)
    .where(
      and(
        eq(s.workPackage.tenantId, tenantId),
        eq(s.workPackage.projectId, projectId),
        isNull(s.workPackage.deletedAt),
      ),
    );
  return {
    rules,
    tickets,
    head,
    hoursByTicket: hours.byTicket,
    ticketIdsByKey: firstIdByKey(identities),
    hoursAvailable: hours.available,
    wpKinds: new Map(
      wps.map((w) => [w.id, w.isLeaf && !w.isMilestone ? ('leaf' as const) : ('not_leaf' as const)]),
    ),
  };
}

/**
 * The preview's read: one tenant transaction, rejecting through `projectNotFound` for a Project
 * the Tenant cannot see (the wording `packages/app`'s `isProjectNotFound` recognises).
 */
export async function loadRuleEvaluation(
  db: Db,
  tenantId: string,
  projectId: string,
): Promise<RuleEvaluationInputs> {
  return withTenant(db, tenantId, async (tx) => {
    const [p] = await tx
      .select({ id: s.project.id })
      .from(s.project)
      .where(eq(s.project.id, projectId));
    if (!p) throw projectNotFound(projectId);
    return loadRuleEvaluationOn(tx, tenantId, projectId);
  });
}

/**
 * FR-22 shared write half (epic-5-retro F3): `applyRules` + append Mapping events.
 * Call under the Project lock. Callers must pass only owned, non-`left_scope` Tickets —
 * ingest uses the snapshot's owned partition; rule-save uses `loadRuleEvaluationOn`.
 */
export async function appendRuleMappingEvents(
  bound: Bound,
  stamp: WriteStamp,
  projectId: string,
  input: {
    readonly rules: readonly MappingRule[];
    readonly tickets: readonly TicketObservation[];
    readonly head: ReadonlyMap<string, MappingHeadEntry>;
    readonly seqFrom: number;
    readonly at: string;
    readonly nextId?: (ticketId: string) => string;
  },
): Promise<{ readonly moved: number }> {
  const events = applyRules(input.rules, input.tickets, input.head, input.seqFrom, input.at);
  if (events.length === 0) return { moved: 0 };
  await appendMappingEvents(
    bound,
    stamp,
    projectId,
    events.map((e) => ({
      ticketId: e.ticketId,
      wpId: e.wpId,
      source: 'rule' as const,
      ruleId: e.ruleId ?? null,
      id: input.nextId?.(e.ticketId) ?? `map-rule-${e.ticketId}-${stamp.at.getTime()}`,
    })),
  );
  return { moved: events.length };
}

/**
 * Story 5.10: re-evaluate every in-scope Ticket against the live rules, under the Project lock,
 * appending (and dual-writing the head for) only the Tickets whose result changes. Each event
 * names the rule that fired — or, for a Ticket a rule no longer holds, the rule it left.
 */
export async function reevaluateMappingRules(
  bound: Bound,
  stamp: WriteStamp,
  projectId: string,
): Promise<{ readonly moved: number }> {
  await lockWatermark(bound, { kind: 'project', projectId });
  const inputs = await loadRuleEvaluationOn(bound.tx, bound.tenantId, projectId);
  return appendRuleMappingEvents(bound, stamp, projectId, {
    rules: inputs.rules,
    tickets: inputs.tickets,
    head: inputs.head,
    seqFrom: 0,
    at: stamp.at.toISOString(),
  });
}

async function anchorOf(tx: Tx, projectId: string): Promise<Date> {
  const [p] = await tx.select().from(s.project).where(eq(s.project.id, projectId));
  if (!p) throw projectNotFound(projectId);
  return p.demoAnchor;
}

/** The Mapping Rule write repository, bound to one transaction and its Tenant. */
export function mappingRuleRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;
  return {
    projectAnchor: (projectId: string) => anchorOf(tx, projectId),

    /** The per-Project watermark lock (AR-37), taken before any rule read that leads to a write. */
    lockProject: (projectId: string) => lockWatermark(bound, { kind: 'project', projectId }),

    /** Whether `wpId` is a live mappable leaf of the Project, a live non-leaf, or absent. */
    ruleTargetOf: async (projectId: string, wpId: string): Promise<RuleTargetKind> => {
      const [wp] = await tx
        .select({ isLeaf: s.workPackage.isLeaf, isMilestone: s.workPackage.isMilestone })
        .from(s.workPackage)
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, projectId),
            eq(s.workPackage.id, wpId),
            isNull(s.workPackage.deletedAt),
          ),
        )
        .limit(1);
      if (!wp) return 'absent';
      return wp.isLeaf && !wp.isMilestone ? 'leaf' : 'not_leaf';
    },

    /** The tracker issue id of the Project's Ticket with this key, or null. */
    ticketIdForKey: async (projectId: string, key: string): Promise<string | null> => {
      const [row] = await tx
        .select({ trackerIssueId: s.ticket.trackerIssueId })
        .from(s.ticket)
        .where(
          and(
            eq(s.ticket.tenantId, tenantId),
            eq(s.ticket.projectId, projectId),
            eq(s.ticket.key, key),
          ),
        )
        .orderBy(asc(s.ticket.trackerIssueId))
        .limit(1);
      return row?.trackerIssueId ?? null;
    },

    /** The live rules of the Project, priority order. */
    liveRules: async (projectId: string): Promise<MappingRuleRecord[]> =>
      (await liveRuleRows(tx, tenantId, projectId)).map(toRecord),

    insertRule: async (command: MappingRuleRowCommand): Promise<void> => {
      await tx.insert(s.mappingRule).values({
        id: command.id,
        tenantId,
        projectId: command.projectId,
        priority: command.priority,
        name: command.name,
        wpId: command.wpId,
        matchField: command.matchField,
        matchValue: command.matchValue,
        deletedAt: null,
      });
    },

    updateRule: async (command: MappingRuleRowCommand): Promise<void> => {
      await tx
        .update(s.mappingRule)
        .set({
          priority: command.priority,
          name: command.name,
          wpId: command.wpId,
          matchField: command.matchField,
          matchValue: command.matchValue,
        })
        .where(
          and(
            eq(s.mappingRule.tenantId, tenantId),
            eq(s.mappingRule.projectId, command.projectId),
            eq(s.mappingRule.id, command.id),
            isNull(s.mappingRule.deletedAt),
          ),
        );
    },

    softDeleteRule: async (stamp: WriteStamp, projectId: string, ruleId: string): Promise<void> => {
      await tx
        .update(s.mappingRule)
        .set({ deletedAt: stamp.at })
        .where(
          and(
            eq(s.mappingRule.tenantId, tenantId),
            eq(s.mappingRule.projectId, projectId),
            eq(s.mappingRule.id, ruleId),
            isNull(s.mappingRule.deletedAt),
          ),
        );
    },

    /**
     * Rewrites the live rules' priorities to 1..n in `orderedIds` order. Two passes, because the
     * partial unique index is checked row by row: first every rule to a distinct negative value
     * (which no live rule holds), then to its final position.
     */
    renumberRules: async (projectId: string, orderedIds: readonly string[]): Promise<void> => {
      const place = async (priorityAt: (index: number) => number) => {
        for (const [index, id] of orderedIds.entries()) {
          await tx
            .update(s.mappingRule)
            .set({ priority: priorityAt(index) })
            .where(
              and(
                eq(s.mappingRule.tenantId, tenantId),
                eq(s.mappingRule.projectId, projectId),
                eq(s.mappingRule.id, id),
                isNull(s.mappingRule.deletedAt),
              ),
            );
        }
      };
      await place((index) => -(index + 1));
      await place((index) => index + 1);
    },

    reevaluate: (stamp: WriteStamp, projectId: string) =>
      reevaluateMappingRules(bound, stamp, projectId),
  };
}
