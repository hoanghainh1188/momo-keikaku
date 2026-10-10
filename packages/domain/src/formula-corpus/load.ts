/**
 * Story 6.1 / Q1-A: load file-fixture goldens keyed by `formulaVersion`.
 *
 * JSON cannot carry `bigint` / `Map` / `Set` exactly (AD-4 codec), so fixtures store decimal
 * strings and entry arrays; this loader revives the ComputationInputs shape `computeAt` needs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReviewInput } from '../review';
import type { LedgerEntry, MappingEvent, Resource, WorkPackage } from '../types';
import type { Mh } from '../units';

const CORPUS_ROOT = dirname(fileURLToPath(import.meta.url));

export interface FormulaGoldenFixture {
  readonly id: string;
  readonly formulaVersion: string;
  readonly inputs: ReviewInput;
  readonly expected: {
    readonly formulaVersion: string;
    readonly measurementBasis: 'hours' | 'count';
    readonly unplannedMh: Mh;
    readonly totalMh: Mh;
    readonly mappedBaselinedMh: Mh;
  };
}

interface FixtureFile {
  readonly id: string;
  readonly formulaVersion: string;
  readonly inputs: Record<string, unknown>;
  readonly expected: {
    readonly formulaVersion: string;
    readonly measurementBasis: 'hours' | 'count';
    readonly unplannedMh: string;
    readonly totalMh: string;
    readonly mappedBaselinedMh: string;
  };
}

function asBigint(value: unknown, path: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new TypeError(`formula corpus ${path}: expected decimal integer string`);
}

function reviveRatio(value: unknown, path: string): { num: bigint; den: bigint } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`formula corpus ${path}: expected ratio object`);
  }
  const r = value as { num?: unknown; den?: unknown };
  return { num: asBigint(r.num, `${path}.num`), den: asBigint(r.den, `${path}.den`) };
}

function reviveInputs(raw: Record<string, unknown>): ReviewInput {
  const project = raw.project as Record<string, unknown>;
  const thresholds = project.thresholds as Record<string, unknown>;
  const wps = (raw.wps as Record<string, unknown>[]).map(
    (w): WorkPackage => ({
      id: w.id as string,
      wbsCode: w.wbsCode as string,
      name: w.name as string,
      parentId: (w.parentId as string | null) ?? null,
      isLeaf: w.isLeaf as boolean,
      isMilestone: w.isMilestone as boolean,
      isCatchAll: w.isCatchAll as boolean,
      plannedMh: asBigint(w.plannedMh, 'wps.plannedMh'),
      actualStart: (w.actualStart as string | null) ?? null,
      actualFinish: (w.actualFinish as string | null) ?? null,
      assignedResourceIds: (w.assignedResourceIds as string[]) ?? [],
    }),
  );
  const baselineVersions = (
    raw.baselineVersions as {
      seq: number;
      id: string;
      reason: string;
      recordedAt: string;
      actor: string;
      wps: {
        wpId: string;
        start: string;
        finish: string;
        baselineMh: string;
        isMilestone: boolean;
        isCatchAll: boolean;
      }[];
    }[]
  ).map((b) => ({
    ...b,
    wps: b.wps.map((wp) => ({
      ...wp,
      baselineMh: asBigint(wp.baselineMh, 'baseline.wps.baselineMh'),
    })),
  }));
  const ledger = (raw.ledger as Record<string, unknown>[]).map(
    (e): LedgerEntry => ({
      seq: e.seq as number,
      ticketId: e.ticketId as string,
      kind: e.kind as LedgerEntry['kind'],
      deltaMh: asBigint(e.deltaMh, 'ledger.deltaMh'),
      windowStart: (e.windowStart as string | null) ?? null,
      windowEnd: e.windowEnd as string,
      assigneeAccountId: (e.assigneeAccountId as string | null) ?? null,
      activeBaselineVersionSeq: (e.activeBaselineVersionSeq as number | null) ?? null,
      connectorId: (e.connectorId as string | null) ?? null,
      snapshotId: (e.snapshotId as string | null) ?? null,
    }),
  );
  const pinned = raw.pinnedSnapshot as Record<string, unknown>;
  const tickets = (pinned.tickets as Record<string, unknown>[]).map((t) => ({
    trackerIssueId: t.trackerIssueId as string,
    key: t.key as string,
    title: t.title as string,
    statusId: t.statusId as string,
    estimateMh: t.estimateMh == null ? null : asBigint(t.estimateMh, 'ticket.estimateMh'),
    actualMh: t.actualMh == null ? null : asBigint(t.actualMh, 'ticket.actualMh'),
    assigneeAccountId: (t.assigneeAccountId as string | null) ?? null,
    createdAt: t.createdAt as string,
    parentIssueId: (t.parentIssueId as string | null) ?? null,
    issueTypeId: t.issueTypeId as string,
    trackerProjectId: (t.trackerProjectId as string | null) ?? null,
    attributes: (t.attributes as never[]) ?? [],
  }));
  const resources = (raw.resources as Record<string, unknown>[]).map(
    (r): Resource => ({
      id: r.id as string,
      name: r.name as string,
      departmentId: r.departmentId as string,
      trackerAccountIds: r.trackerAccountIds as string[],
      rates: ((r.rates as Record<string, unknown>[]) ?? []).map((rate) => ({
        seq: rate.seq as number,
        effectiveFrom: rate.effectiveFrom as string,
        yenPerHour: asBigint(rate.yenPerHour, 'rate.yenPerHour'),
      })),
    }),
  );
  const pinPairs = (raw.trackerSnapshotIdByConnector as [string, string][] | undefined) ?? [];
  const resolved = raw.resolvedStatusIds as string[] | undefined;

  return {
    project: {
      id: project.id as string,
      name: project.name as string,
      clientName: project.clientName as string,
      contractType: project.contractType as ReviewInput['project']['contractType'],
      tzOffsetMinutes: project.tzOffsetMinutes as number,
      teireiWeekday: project.teireiWeekday as number,
      defaultRateYenPerHour: asBigint(project.defaultRateYenPerHour, 'project.defaultRate'),
      eacMethod: project.eacMethod as ReviewInput['project']['eacMethod'],
      thresholds: {
        ratioGreen: reviveRatio(thresholds.ratioGreen, 'thresholds.ratioGreen'),
        ratioAmber: reviveRatio(thresholds.ratioAmber, 'thresholds.ratioAmber'),
        tcpiRed: reviveRatio(thresholds.tcpiRed, 'thresholds.tcpiRed'),
        unplannedGreenBelow: reviveRatio(
          thresholds.unplannedGreenBelow,
          'thresholds.unplannedGreenBelow',
        ),
        unplannedAmberMax: reviveRatio(
          thresholds.unplannedAmberMax,
          'thresholds.unplannedAmberMax',
        ),
      },
    },
    calendar: raw.calendar as ReviewInput['calendar'],
    wps,
    baselineVersions,
    activeBaselineSeq: raw.activeBaselineSeq as number | null,
    baselineVersionId: (raw.baselineVersionId as string | null) ?? null,
    ledger,
    mappingEvents: raw.mappingEvents as MappingEvent[],
    pinnedSnapshot: {
      snapshotId: pinned.snapshotId as string,
      observedAt: pinned.observedAt as string,
      hoursFieldPresent: pinned.hoursFieldPresent as boolean,
      adapterKind: pinned.adapterKind as ReviewInput['pinnedSnapshot']['adapterKind'],
      tickets,
    },
    trackerSnapshotIdByConnector: new Map(pinPairs),
    ledgerSeqMax: (raw.ledgerSeqMax as number | null) ?? null,
    resources,
    period: raw.period as ReviewInput['period'],
    asOf: raw.asOf as string,
    dispositions: (raw.dispositions as ReviewInput['dispositions']) ?? [],
    formulaVersion: raw.formulaVersion as string,
    measurementBasis: raw.measurementBasis as ReviewInput['measurementBasis'],
    resolvedStatusIds: resolved ? new Set(resolved) : undefined,
    calendarId: raw.calendarId as string | undefined,
    calendarVersion: (raw.calendarVersion as number | null) ?? null,
    scheduleRunSeq: (raw.scheduleRunSeq as number | null) ?? null,
    mappingSeqMax: (raw.mappingSeqMax as number | null) ?? null,
    dispositionSeqMax: (raw.dispositionSeqMax as number | null) ?? null,
    settingSeqMax: (raw.settingSeqMax as number | null) ?? null,
    tenantSettingSeqMax: (raw.tenantSettingSeqMax as number | null) ?? null,
    wpStatusSeqMax: (raw.wpStatusSeqMax as number | null) ?? null,
    wpFlagSeqMax: (raw.wpFlagSeqMax as number | null) ?? null,
    linkSeqMax: (raw.linkSeqMax as number | null) ?? null,
    rateSeqMax: (raw.rateSeqMax as number | null) ?? null,
    projectDefaultRateSeqMax: (raw.projectDefaultRateSeqMax as number | null) ?? null,
    pctOverrideSeqMax: (raw.pctOverrideSeqMax as number | null) ?? null,
    calendarSeqMax: (raw.calendarSeqMax as number | null) ?? null,
    connectorScopeSeqMax: (raw.connectorScopeSeqMax as number | null) ?? null,
    connectorSettingSeqMax: (raw.connectorSettingSeqMax as number | null) ?? null,
    basisSeqMax: (raw.basisSeqMax as number | null) ?? null,
    visibilityPolicy: (raw.visibilityPolicy as string | null) ?? null,
    visibilitySeqMax: (raw.visibilitySeqMax as number | null) ?? null,
  };
}

/** Every golden fixture under `formula-corpus/<formulaVersion>/`. */
export function loadFormulaCorpus(): readonly FormulaGoldenFixture[] {
  const versions = readdirSync(CORPUS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const out: FormulaGoldenFixture[] = [];
  for (const version of versions) {
    const dir = join(CORPUS_ROOT, version);
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const file = JSON.parse(readFileSync(join(dir, name), 'utf8')) as FixtureFile;
      if (file.formulaVersion !== version) {
        throw new Error(
          `formula corpus ${version}/${name}: formulaVersion "${file.formulaVersion}" ≠ directory`,
        );
      }
      const inputs = reviveInputs(file.inputs);
      if (inputs.formulaVersion != null && inputs.formulaVersion !== file.formulaVersion) {
        throw new Error(
          `formula corpus ${version}/${name}: inputs.formulaVersion "${inputs.formulaVersion}" ≠ file key "${file.formulaVersion}"`,
        );
      }
      out.push({
        id: file.id,
        formulaVersion: file.formulaVersion,
        inputs,
        expected: {
          formulaVersion: file.expected.formulaVersion,
          measurementBasis: file.expected.measurementBasis,
          unplannedMh: asBigint(file.expected.unplannedMh, 'expected.unplannedMh'),
          totalMh: asBigint(file.expected.totalMh, 'expected.totalMh'),
          mappedBaselinedMh: asBigint(
            file.expected.mappedBaselinedMh,
            'expected.mappedBaselinedMh',
          ),
        },
      });
    }
  }
  return out;
}

/** Corpus root on disk (for tests that assert layout). */
export function formulaCorpusRoot(): string {
  return CORPUS_ROOT;
}
