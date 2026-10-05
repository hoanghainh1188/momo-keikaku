/**
 * Actuals Ledger ingest writer (story 5.5 / AR-15).
 *
 * THE one path that inserts `tracker_snapshot`, `ticket_observation`, and
 * `actuals_ledger_entry`. Read happens outside; this runs under one Project
 * `lockWatermark` inside the caller's tenant transaction.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  AdapterKindMismatchError,
  LedgerInvariantError,
  advanceLeftScopeState,
  applyRules,
  checkLedgerInvariant,
  ingestSnapshot,
  INITIAL_BASIS_LATCH,
  mappingHead,
  partitionOwnedTickets,
  replayBasisLatch,
  type AdapterKind,
  type LedgerEntry,
  type MappingEvent,
  type MappingRule,
  type SnapshotRead,
  type TicketAttribute,
  type TicketObservation,
  type TrackerAccountObservation,
} from '@momo/domain';
import type { Bound } from '../../bound';
import * as s from '../../schema';
import { lockWatermark } from '../../watermark-lock';
import { trackerRepositoryOn, type TrackerKind } from '../tracker';

export interface IngestScopeRead {
  readonly complete: boolean;
  readonly observedAt: string;
  readonly tickets: readonly TicketObservation[];
  readonly accounts: readonly TrackerAccountObservation[];
  readonly hoursFieldPresent: boolean;
  readonly adapterKind: AdapterKind;
}

export interface WriteIngestSnapshotInput {
  readonly projectId: string;
  readonly connectorId: string;
  readonly read: IngestScopeRead;
  readonly snapshotId: string;
  readonly nextId: () => string;
  readonly actor: string;
  readonly at: Date;
}

export type WriteIngestSnapshotResult =
  | { readonly kind: 'written'; readonly snapshotId: string }
  | { readonly kind: 'already_written'; readonly snapshotId: string };

async function chunked<T>(rows: readonly T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size) as T[]);
  }
}

function toSnapshotRead(
  header: {
    observedAt: Date;
    adapterKind: string;
    measurementBasis: string;
  },
  tickets: TicketObservation[],
  accounts: TrackerAccountObservation[],
): SnapshotRead {
  return {
    observedAt: header.observedAt.toISOString(),
    hoursFieldPresent: header.measurementBasis === 'hours',
    tickets,
    accounts,
    adapterKind: header.adapterKind as AdapterKind,
    complete: true,
    rateLimit: null,
  };
}

export function ingestWriteRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;
  const tracker = trackerRepositoryOn(bound);

  async function latestBaselineVersionSeq(projectId: string): Promise<number | null> {
    const [row] = await tx
      .select({ seq: s.baselineVersion.seq })
      .from(s.baselineVersion)
      .where(
        and(eq(s.baselineVersion.tenantId, tenantId), eq(s.baselineVersion.projectId, projectId)),
      )
      .orderBy(desc(s.baselineVersion.seq))
      .limit(1);
    return row?.seq ?? null;
  }

  async function loadPrevSnapshot(connectorId: string): Promise<{
    header: typeof s.trackerSnapshot.$inferSelect;
    read: SnapshotRead;
  } | null> {
    const [header] = await tx
      .select()
      .from(s.trackerSnapshot)
      .where(
        and(
          eq(s.trackerSnapshot.tenantId, tenantId),
          eq(s.trackerSnapshot.connectorId, connectorId),
        ),
      )
      .orderBy(desc(s.trackerSnapshot.seq))
      .limit(1);
    if (!header) return null;

    const obsRows = await tx
      .select()
      .from(s.ticketObservation)
      .where(
        and(
          eq(s.ticketObservation.tenantId, tenantId),
          eq(s.ticketObservation.snapshotId, header.id),
        ),
      );

    const tickets: TicketObservation[] = obsRows.map((o) => ({
      trackerIssueId: o.trackerIssueId,
      key: o.key,
      title: o.title,
      statusId: o.statusId,
      estimateMh: o.estimateMh,
      actualMh: o.actualMh,
      assigneeAccountId: o.assigneeAccountId,
      createdAt: o.createdAt.toISOString(),
      parentIssueId: o.parentIssueId,
      issueTypeId: o.issueTypeId,
      trackerProjectId: o.trackerProjectId,
      attributes: (o.attributes ?? []) as TicketAttribute[],
    }));

    return {
      header,
      read: toSnapshotRead(header, tickets, []),
    };
  }

  async function ensureProjectSettingHead(
    projectId: string,
    actor: string,
    at: Date,
  ): Promise<void> {
    const [head] = await tx
      .select({ seq: s.projectSettingEvent.seq })
      .from(s.projectSettingEvent)
      .where(
        and(
          eq(s.projectSettingEvent.tenantId, tenantId),
          eq(s.projectSettingEvent.projectId, projectId),
        ),
      )
      .orderBy(desc(s.projectSettingEvent.seq))
      .limit(1);
    if (head) return;

    const [prj] = await tx
      .select({
        tzOffsetMinutes: s.project.tzOffsetMinutes,
        teireiWeekday: s.project.teireiWeekday,
      })
      .from(s.project)
      .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, projectId)))
      .limit(1);
    if (!prj) {
      throw new Error(`project ${projectId} not found while seeding project_setting_event`);
    }
    await tx.insert(s.projectSettingEvent).values({
      tenantId,
      projectId,
      tzOffsetMinutes: prj.tzOffsetMinutes,
      teireiWeekday: prj.teireiWeekday,
      actor,
      at,
    });
  }

  async function loadMappingRules(projectId: string): Promise<MappingRule[]> {
    const rows = await tx
      .select()
      .from(s.mappingRule)
      .where(and(eq(s.mappingRule.tenantId, tenantId), eq(s.mappingRule.projectId, projectId)));
    return rows.map((r) => ({
      id: r.id,
      priority: r.priority,
      name: r.name,
      wpId: r.wpId,
      match: { field: r.matchField, value: r.matchValue } as MappingRule['match'],
    }));
  }

  async function loadMappingEvents(projectId: string): Promise<MappingEvent[]> {
    const rows = await tx
      .select()
      .from(s.mappingEvent)
      .where(and(eq(s.mappingEvent.tenantId, tenantId), eq(s.mappingEvent.projectId, projectId)))
      .orderBy(s.mappingEvent.seq);
    return rows.map((r) => ({
      seq: r.seq,
      ticketId: r.ticketId,
      wpId: r.wpId,
      source: r.source as MappingEvent['source'],
      ruleId: r.ruleId,
      at: r.at.toISOString(),
      actor: r.actor,
    }));
  }

  /**
   * Ticket-wide prior Σ (every Connector). After PM Transfer the ledger stays on the Ticket —
   * filtering by the new owner Connector would rebook retained hours as a fresh delta.
   */
  async function loadPriorLedger(ticketIds: readonly string[]): Promise<LedgerEntry[]> {
    if (ticketIds.length === 0) return [];
    const out: LedgerEntry[] = [];
    await chunked([...ticketIds], 500, async (batch) => {
      const rows = await tx
        .select({
          seq: s.actualsLedgerEntry.seq,
          ticketId: s.actualsLedgerEntry.ticketId,
          kind: s.actualsLedgerEntry.kind,
          deltaMh: s.actualsLedgerEntry.deltaMh,
          windowStart: s.actualsLedgerEntry.windowStart,
          windowEnd: s.actualsLedgerEntry.windowEnd,
          assigneeAccountId: s.actualsLedgerEntry.assigneeAccountId,
          activeBaselineVersionSeq: s.actualsLedgerEntry.activeBaselineVersionSeq,
        })
        .from(s.actualsLedgerEntry)
        .where(
          and(
            eq(s.actualsLedgerEntry.tenantId, tenantId),
            inArray(s.actualsLedgerEntry.ticketId, batch),
          ),
        );
      for (const r of rows) {
        out.push({
          seq: r.seq,
          ticketId: r.ticketId,
          kind: r.kind as LedgerEntry['kind'],
          deltaMh: r.deltaMh,
          windowStart: r.windowStart?.toISOString() ?? null,
          windowEnd: r.windowEnd.toISOString(),
          assigneeAccountId: r.assigneeAccountId,
          activeBaselineVersionSeq: r.activeBaselineVersionSeq,
        });
      }
    });
    return out;
  }

  async function loadTicketsByIssueIds(
    trackerKind: TrackerKind,
    trackerSite: string,
    issueIds: readonly string[],
  ): Promise<Map<string, typeof s.ticket.$inferSelect>> {
    const out = new Map<string, typeof s.ticket.$inferSelect>();
    if (issueIds.length === 0) return out;
    await chunked([...issueIds], 500, async (batch) => {
      const rows = await tx
        .select()
        .from(s.ticket)
        .where(
          and(
            eq(s.ticket.tenantId, tenantId),
            eq(s.ticket.trackerKind, trackerKind),
            eq(s.ticket.trackerSite, trackerSite),
            inArray(s.ticket.trackerIssueId, batch),
          ),
        );
      for (const row of rows) out.set(row.trackerIssueId, row);
    });
    return out;
  }

  /**
   * Story 5.6: durable left_scope after two consecutive complete absences on the owner
   * Connector. Sightings clear streak/flag; incomplete reads never reach this writer.
   */
  async function persistLeftScopeState(input: {
    readonly connectorId: string;
    readonly trackerKind: TrackerKind;
    readonly trackerSite: string;
    readonly nextIssueIds: ReadonlySet<string>;
  }): Promise<void> {
    const seen = [...input.nextIssueIds];
    if (seen.length > 0) {
      await chunked(seen, 500, (batch) =>
        tx
          .update(s.ticket)
          .set({ leftScope: false, absentCompleteStreak: 0 })
          .where(
            and(
              eq(s.ticket.tenantId, tenantId),
              eq(s.ticket.trackerKind, input.trackerKind),
              eq(s.ticket.trackerSite, input.trackerSite),
              eq(s.ticket.ownerConnectorId, input.connectorId),
              inArray(s.ticket.trackerIssueId, batch),
            ),
          ),
      );
    }

    const owned = await tx
      .select({
        trackerIssueId: s.ticket.trackerIssueId,
        leftScope: s.ticket.leftScope,
        absentCompleteStreak: s.ticket.absentCompleteStreak,
      })
      .from(s.ticket)
      .where(
        and(
          eq(s.ticket.tenantId, tenantId),
          eq(s.ticket.trackerKind, input.trackerKind),
          eq(s.ticket.trackerSite, input.trackerSite),
          eq(s.ticket.ownerConnectorId, input.connectorId),
        ),
      );

    for (const row of owned) {
      const next = advanceLeftScopeState(
        { leftScope: row.leftScope, absentCompleteStreak: row.absentCompleteStreak },
        input.nextIssueIds.has(row.trackerIssueId),
      );
      if (
        next.leftScope === row.leftScope &&
        next.absentCompleteStreak === row.absentCompleteStreak
      ) {
        continue;
      }
      await tx
        .update(s.ticket)
        .set({
          absentCompleteStreak: next.absentCompleteStreak,
          leftScope: next.leftScope,
        })
        .where(
          and(
            eq(s.ticket.tenantId, tenantId),
            eq(s.ticket.trackerKind, input.trackerKind),
            eq(s.ticket.trackerSite, input.trackerSite),
            eq(s.ticket.trackerIssueId, row.trackerIssueId),
          ),
        );
    }
  }

  async function persistOverlaps(input: {
    readonly projectId: string;
    readonly claimerConnectorId: string;
    readonly snapshotId: string;
    readonly observedAt: Date;
    readonly nextId: () => string;
    readonly overlaps: readonly {
      readonly trackerIssueId: string;
      readonly key: string;
      readonly ownerConnectorId: string;
    }[];
    readonly nextIssueIds: ReadonlySet<string>;
  }): Promise<void> {
    for (const o of input.overlaps) {
      await tx
        .insert(s.connectorOverlap)
        .values({
          id: input.nextId(),
          tenantId,
          projectId: input.projectId,
          trackerIssueId: o.trackerIssueId,
          ticketKey: o.key,
          ownerConnectorId: o.ownerConnectorId,
          claimerConnectorId: input.claimerConnectorId,
          observedAt: input.observedAt,
          snapshotId: input.snapshotId,
        })
        .onConflictDoUpdate({
          target: [
            s.connectorOverlap.tenantId,
            s.connectorOverlap.trackerIssueId,
            s.connectorOverlap.claimerConnectorId,
          ],
          set: {
            ticketKey: o.key,
            ownerConnectorId: o.ownerConnectorId,
            observedAt: input.observedAt,
            snapshotId: input.snapshotId,
          },
        });
    }

    const stillClaimed = new Set(input.overlaps.map((o) => o.trackerIssueId));
    const open = await tx
      .select({
        id: s.connectorOverlap.id,
        trackerIssueId: s.connectorOverlap.trackerIssueId,
      })
      .from(s.connectorOverlap)
      .where(
        and(
          eq(s.connectorOverlap.tenantId, tenantId),
          eq(s.connectorOverlap.claimerConnectorId, input.claimerConnectorId),
        ),
      );
    const staleIds = open
      .filter((row) => !stillClaimed.has(row.trackerIssueId) || !input.nextIssueIds.has(row.trackerIssueId))
      .map((row) => row.id);
    if (staleIds.length > 0) {
      await chunked(staleIds, 500, (batch) =>
        tx
          .delete(s.connectorOverlap)
          .where(and(eq(s.connectorOverlap.tenantId, tenantId), inArray(s.connectorOverlap.id, batch))),
      );
    }
  }

  return {
    async writeIngestSnapshot(input: WriteIngestSnapshotInput): Promise<WriteIngestSnapshotResult> {
      if (input.read.complete !== true) {
        throw new Error('writeIngestSnapshot refuses an incomplete ScopeRead');
      }
      const [connector] = await tx
        .select()
        .from(s.connector)
        .where(
          and(
            eq(s.connector.tenantId, tenantId),
            eq(s.connector.id, input.connectorId),
          ),
        )
        .limit(1);
      if (!connector || connector.projectId !== input.projectId) {
        throw new Error(`connector ${input.connectorId} not found for project ${input.projectId}`);
      }

      // AR-15: Baseline-by-seq is chosen before the lock; then one Project lock for the write.
      const activeBaselineVersionSeq = await latestBaselineVersionSeq(input.projectId);
      await lockWatermark(bound, { kind: 'project', projectId: input.projectId });

      // Load prev under the lock so concurrent jobs cannot both derive against a stale predecessor.
      const prev = await loadPrevSnapshot(input.connectorId);
      await ensureProjectSettingHead(input.projectId, input.actor, input.at);

      // Idempotent on (connector_id, observedAt): check under the lock — never catch 23505
      // mid-transaction (Postgres aborts the tx and later statements fail).
      const observedAt = new Date(input.read.observedAt);
      if (Number.isNaN(observedAt.getTime())) {
        throw new Error(`writeIngestSnapshot refuses invalid observedAt: ${input.read.observedAt}`);
      }
      const [existingAt] = await tx
        .select({ id: s.trackerSnapshot.id })
        .from(s.trackerSnapshot)
        .where(
          and(
            eq(s.trackerSnapshot.tenantId, tenantId),
            eq(s.trackerSnapshot.connectorId, input.connectorId),
            eq(s.trackerSnapshot.observedAt, observedAt),
          ),
        )
        .limit(1);
      if (existingAt) {
        return { kind: 'already_written', snapshotId: existingAt.id };
      }

      const scopeSeq = await (async () => {
        const [row] = await tx
          .select({ seq: s.connectorScopeEvent.seq })
          .from(s.connectorScopeEvent)
          .where(
            and(
              eq(s.connectorScopeEvent.tenantId, tenantId),
              eq(s.connectorScopeEvent.connectorId, input.connectorId),
            ),
          )
          .orderBy(desc(s.connectorScopeEvent.seq))
          .limit(1);
        return row?.seq ?? null;
      })();

      const trackerKind = (connector.adapter === 'fixture' ? 'fixture' : 'backlog') as TrackerKind;
      const trackerSite = connector.site;
      const ticketIds = input.read.tickets.map((t) => t.trackerIssueId);
      const existingTickets = await loadTicketsByIssueIds(trackerKind, trackerSite, ticketIds);

      const ownerByIssueId = new Map(
        [...existingTickets.entries()].map(([id, row]) => [id, row.ownerConnectorId]),
      );
      const partitioned = partitionOwnedTickets(
        input.read.tickets,
        ownerByIssueId,
        input.connectorId,
      );
      const ownedTickets = partitioned.owned;
      const overlaps = partitioned.overlaps.map(({ ticket, ownerConnectorId }) => ({
        trackerIssueId: ticket.trackerIssueId,
        key: ticket.key,
        ownerConnectorId,
      }));

      // Prev may still list Tickets this Connector no longer owns — drop them from the
      // derive baseline so absences/overlap skips stay honest.
      const prevOwnedRead: SnapshotRead | null = prev
        ? {
            ...prev.read,
            tickets: prev.read.tickets.filter((t) => {
              const row = existingTickets.get(t.trackerIssueId);
              // Not in existing → was only ever observed here (or purged); keep.
              if (!row) return true;
              return row.ownerConnectorId === input.connectorId;
            }),
          }
        : null;

      const nextOwnedRead: SnapshotRead = {
        observedAt: input.read.observedAt,
        hoursFieldPresent: input.read.hoursFieldPresent,
        tickets: ownedTickets,
        accounts: [...input.read.accounts],
        adapterKind: input.read.adapterKind,
        complete: true,
        rateLimit: null,
      };

      const ownedIds = ownedTickets.map((t) => t.trackerIssueId);
      const priorLedger = await loadPriorLedger(ownedIds);
      const priorLedgerMhByTicket = new Map<string, bigint>();
      for (const e of priorLedger) {
        priorLedgerMhByTicket.set(
          e.ticketId,
          (priorLedgerMhByTicket.get(e.ticketId) ?? 0n) + e.deltaMh,
        );
      }

      const prevScopeSeq = prev?.header.scopeSeq ?? null;
      const scopeChangedSincePrev =
        prev !== null &&
        scopeSeq !== null &&
        (prevScopeSeq === null || scopeSeq > prevScopeSeq);

      // Derive before INSERT so AdapterKindMismatchError refuses without a snapshot row.
      const derived = ingestSnapshot({
        prev: prevOwnedRead,
        next: nextOwnedRead,
        activeBaselineVersionSeq,
        seqFrom: 1,
        approvalRecordedAt: connector.approvalRecordedAt,
        priorLedgerMhByTicket,
        scopeChangedSincePrev,
      });

      await tx.insert(s.trackerSnapshot).values({
        id: input.snapshotId,
        tenantId,
        connectorId: input.connectorId,
        observedAt,
        measurementBasis: derived.measurementBasis,
        ticketCount: input.read.tickets.length,
        adapterKind: input.read.adapterKind,
        scopeSeq,
      });

      for (const account of input.read.accounts) {
        await tracker.upsertTrackerAccount({
          id: input.nextId(),
          trackerKind,
          trackerSite,
          observation: account,
        });
      }
      for (const ticket of input.read.tickets) {
        await tracker.upsertTicket({
          id: input.nextId(),
          trackerKind,
          trackerSite,
          trackerIssueId: ticket.trackerIssueId,
          ownerConnectorId: input.connectorId,
          projectId: input.projectId,
          key: ticket.key,
        });
      }

      const invariant = checkLedgerInvariant([...priorLedger, ...derived.entries], nextOwnedRead);
      if (!invariant.ok) {
        throw new LedgerInvariantError(invariant.violations);
      }

      const cleared = new Set(derived.hoursCleared.map((c) => c.ticketId));
      await chunked([...input.read.tickets], 500, (batch) =>
        tx.insert(s.ticketObservation).values(
          batch.map((t) => ({
            id: `${input.snapshotId}-${t.trackerIssueId}`,
            tenantId,
            snapshotId: input.snapshotId,
            trackerIssueId: t.trackerIssueId,
            key: t.key,
            title: t.title,
            statusId: t.statusId,
            estimateMh: t.estimateMh,
            actualMh: t.actualMh,
            assigneeAccountId: t.assigneeAccountId,
            issueTypeId: t.issueTypeId,
            parentIssueId: t.parentIssueId,
            trackerProjectId: t.trackerProjectId,
            attributes: t.attributes,
            createdAt: new Date(t.createdAt),
            hoursCleared: cleared.has(t.trackerIssueId),
          })),
        ),
      );

      const prevSnapshotId = prev?.header.id ?? null;
      if (derived.entries.length > 0) {
        await chunked(derived.entries, 500, (batch) =>
          tx.insert(s.actualsLedgerEntry).values(
            batch.map((e) => ({
              id: input.nextId(),
              tenantId,
              connectorId: input.connectorId,
              ticketId: e.ticketId,
              kind: e.kind,
              deltaMh: e.deltaMh,
              windowStart: e.windowStart ? new Date(e.windowStart) : null,
              windowEnd: new Date(e.windowEnd),
              assigneeAccountId: e.assigneeAccountId,
              activeBaselineVersionSeq: e.activeBaselineVersionSeq,
              snapshotId: input.snapshotId,
              prevSnapshotId: e.windowStart === null ? null : prevSnapshotId,
            })),
          ),
        );
      }

      const nextIssueIds = new Set(ticketIds);
      await persistLeftScopeState({
        connectorId: input.connectorId,
        trackerKind,
        trackerSite,
        nextIssueIds,
      });
      await persistOverlaps({
        projectId: input.projectId,
        claimerConnectorId: input.connectorId,
        snapshotId: input.snapshotId,
        observedAt,
        nextId: input.nextId,
        overlaps,
        nextIssueIds,
      });

      // FR-22: re-evaluate Mapping Rules; manual/disposition head wins.
      const rules = await loadMappingRules(input.projectId);
      const mappingEvents = await loadMappingEvents(input.projectId);
      const head = mappingHead(mappingEvents);
      const seqFrom =
        mappingEvents.reduce((max, e) => (e.seq > max ? e.seq : max), 0) + 1;
      const newMappings = applyRules(
        rules,
        [...input.read.tickets],
        head,
        seqFrom,
        input.read.observedAt,
      );
      if (newMappings.length > 0) {
        await tx.insert(s.mappingEvent).values(
          newMappings.map((m) => ({
            id: input.nextId(),
            tenantId,
            projectId: input.projectId,
            ticketId: m.ticketId,
            wpId: m.wpId,
            source: 'rule' as const,
            ruleId: m.ruleId ?? null,
            at: new Date(m.at),
            actor: m.actor,
          })),
        );
      }


      // Story 5.7 / AD-8: N=3 hysteresis on complete snaps only — append basis event on flip.
      {
        const [basisHead] = await tx
          .select({
            seq: s.measurementBasisEvent.seq,
            basis: s.measurementBasisEvent.basis,
            at: s.measurementBasisEvent.at,
          })
          .from(s.measurementBasisEvent)
          .where(
            and(
              eq(s.measurementBasisEvent.tenantId, tenantId),
              eq(s.measurementBasisEvent.connectorId, input.connectorId),
            ),
          )
          .orderBy(desc(s.measurementBasisEvent.seq))
          .limit(1);

        const snapRows = await tx
          .select({
            measurementBasis: s.trackerSnapshot.measurementBasis,
            observedAt: s.trackerSnapshot.observedAt,
            seq: s.trackerSnapshot.seq,
          })
          .from(s.trackerSnapshot)
          .where(
            and(
              eq(s.trackerSnapshot.tenantId, tenantId),
              eq(s.trackerSnapshot.connectorId, input.connectorId),
            ),
          )
          .orderBy(asc(s.trackerSnapshot.seq));

        // Observations after the last flip (by observedAt); if none yet, all snaps.
        const observedSequence = (
          basisHead
            ? snapRows.filter((r) => r.observedAt.getTime() > basisHead.at.getTime())
            : snapRows
        ).map((r) => r.measurementBasis as 'hours' | 'count');

        const initial = basisHead
          ? {
              basis: basisHead.basis as 'hours' | 'count',
              streakTowardOpposite: 0,
            }
          : INITIAL_BASIS_LATCH;
        const advanced = replayBasisLatch(initial, observedSequence);
        const headBasis = initial.basis;
        if (advanced.basis !== headBasis) {
          await tx.insert(s.measurementBasisEvent).values({
            tenantId,
            connectorId: input.connectorId,
            projectId: input.projectId,
            basis: advanced.basis,
            actor: 'system:ingest',
            at: observedAt,
          });
        }
      }

      // Clear a prior credential banner now that a good snapshot landed.
      await tx
        .update(s.connector)
        .set({ lastErrorCode: null, lastErrorMessage: null, lastErrorAt: null })
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, input.connectorId)));

      return { kind: 'written', snapshotId: input.snapshotId };
    },
  };
}

export type IngestWriteRepository = ReturnType<typeof ingestWriteRepositoryOn>;
