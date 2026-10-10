/**
 * Story 6.1 / Q1-A: load file-fixture goldens keyed by `formulaVersion`.
 *
 * JSON cannot carry `bigint` / `Map` / `Set` exactly (AD-4 codec), so fixtures store decimal
 * strings and entry arrays; this loader revives the ComputationInputs shape `computeAt` needs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const CORPUS_ROOT = dirname(fileURLToPath(import.meta.url));
function asBigint(value, path) {
    if (typeof value === 'bigint')
        return value;
    if (typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value))
        return BigInt(value);
    throw new TypeError(`formula corpus ${path}: expected decimal integer string`);
}
function reviveRatio(value, path) {
    if (typeof value !== 'object' || value === null) {
        throw new TypeError(`formula corpus ${path}: expected ratio object`);
    }
    const r = value;
    return { num: asBigint(r.num, `${path}.num`), den: asBigint(r.den, `${path}.den`) };
}
function reviveInputs(raw) {
    const project = raw.project;
    const thresholds = project.thresholds;
    const wps = raw.wps.map((w) => ({
        id: w.id,
        wbsCode: w.wbsCode,
        name: w.name,
        parentId: w.parentId ?? null,
        isLeaf: w.isLeaf,
        isMilestone: w.isMilestone,
        isCatchAll: w.isCatchAll,
        plannedMh: asBigint(w.plannedMh, 'wps.plannedMh'),
        actualStart: w.actualStart ?? null,
        actualFinish: w.actualFinish ?? null,
        assignedResourceIds: w.assignedResourceIds ?? [],
    }));
    const baselineVersions = raw.baselineVersions.map((b) => ({
        ...b,
        wps: b.wps.map((wp) => ({
            ...wp,
            baselineMh: asBigint(wp.baselineMh, 'baseline.wps.baselineMh'),
        })),
    }));
    const ledger = raw.ledger.map((e) => ({
        seq: e.seq,
        ticketId: e.ticketId,
        kind: e.kind,
        deltaMh: asBigint(e.deltaMh, 'ledger.deltaMh'),
        windowStart: e.windowStart ?? null,
        windowEnd: e.windowEnd,
        assigneeAccountId: e.assigneeAccountId ?? null,
        activeBaselineVersionSeq: e.activeBaselineVersionSeq ?? null,
        connectorId: e.connectorId ?? null,
        snapshotId: e.snapshotId ?? null,
    }));
    const pinned = raw.pinnedSnapshot;
    const tickets = pinned.tickets.map((t) => ({
        trackerIssueId: t.trackerIssueId,
        key: t.key,
        title: t.title,
        statusId: t.statusId,
        estimateMh: t.estimateMh == null ? null : asBigint(t.estimateMh, 'ticket.estimateMh'),
        actualMh: t.actualMh == null ? null : asBigint(t.actualMh, 'ticket.actualMh'),
        assigneeAccountId: t.assigneeAccountId ?? null,
        createdAt: t.createdAt,
        parentIssueId: t.parentIssueId ?? null,
        issueTypeId: t.issueTypeId,
        trackerProjectId: t.trackerProjectId ?? null,
        attributes: t.attributes ?? [],
    }));
    const resources = raw.resources.map((r) => ({
        id: r.id,
        name: r.name,
        departmentId: r.departmentId,
        trackerAccountIds: r.trackerAccountIds,
        rates: (r.rates ?? []).map((rate) => ({
            seq: rate.seq,
            effectiveFrom: rate.effectiveFrom,
            yenPerHour: asBigint(rate.yenPerHour, 'rate.yenPerHour'),
        })),
    }));
    const pinPairs = raw.trackerSnapshotIdByConnector ?? [];
    const resolved = raw.resolvedStatusIds;
    return {
        project: {
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            contractType: project.contractType,
            tzOffsetMinutes: project.tzOffsetMinutes,
            teireiWeekday: project.teireiWeekday,
            defaultRateYenPerHour: asBigint(project.defaultRateYenPerHour, 'project.defaultRate'),
            eacMethod: project.eacMethod,
            thresholds: {
                ratioGreen: reviveRatio(thresholds.ratioGreen, 'thresholds.ratioGreen'),
                ratioAmber: reviveRatio(thresholds.ratioAmber, 'thresholds.ratioAmber'),
                tcpiRed: reviveRatio(thresholds.tcpiRed, 'thresholds.tcpiRed'),
                unplannedGreenBelow: reviveRatio(thresholds.unplannedGreenBelow, 'thresholds.unplannedGreenBelow'),
                unplannedAmberMax: reviveRatio(thresholds.unplannedAmberMax, 'thresholds.unplannedAmberMax'),
            },
        },
        calendar: raw.calendar,
        wps,
        baselineVersions,
        activeBaselineSeq: raw.activeBaselineSeq,
        baselineVersionId: raw.baselineVersionId ?? null,
        ledger,
        mappingEvents: raw.mappingEvents,
        pinnedSnapshot: {
            snapshotId: pinned.snapshotId,
            observedAt: pinned.observedAt,
            hoursFieldPresent: pinned.hoursFieldPresent,
            adapterKind: pinned.adapterKind,
            tickets,
        },
        trackerSnapshotIdByConnector: new Map(pinPairs),
        ledgerSeqMax: raw.ledgerSeqMax ?? null,
        resources,
        period: raw.period,
        asOf: raw.asOf,
        dispositions: raw.dispositions ?? [],
        formulaVersion: raw.formulaVersion,
        measurementBasis: raw.measurementBasis,
        resolvedStatusIds: resolved ? new Set(resolved) : undefined,
        calendarId: raw.calendarId,
        calendarVersion: raw.calendarVersion ?? null,
        scheduleRunSeq: raw.scheduleRunSeq ?? null,
        mappingSeqMax: raw.mappingSeqMax ?? null,
        dispositionSeqMax: raw.dispositionSeqMax ?? null,
        settingSeqMax: raw.settingSeqMax ?? null,
        tenantSettingSeqMax: raw.tenantSettingSeqMax ?? null,
        wpStatusSeqMax: raw.wpStatusSeqMax ?? null,
        wpFlagSeqMax: raw.wpFlagSeqMax ?? null,
        linkSeqMax: raw.linkSeqMax ?? null,
        rateSeqMax: raw.rateSeqMax ?? null,
        projectDefaultRateSeqMax: raw.projectDefaultRateSeqMax ?? null,
        pctOverrideSeqMax: raw.pctOverrideSeqMax ?? null,
        calendarSeqMax: raw.calendarSeqMax ?? null,
        connectorScopeSeqMax: raw.connectorScopeSeqMax ?? null,
        connectorSettingSeqMax: raw.connectorSettingSeqMax ?? null,
        basisSeqMax: raw.basisSeqMax ?? null,
        visibilityPolicy: raw.visibilityPolicy ?? null,
        visibilitySeqMax: raw.visibilitySeqMax ?? null,
    };
}
/** Every golden fixture under `formula-corpus/<formulaVersion>/`. */
export function loadFormulaCorpus() {
    const versions = readdirSync(CORPUS_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    const out = [];
    for (const version of versions) {
        const dir = join(CORPUS_ROOT, version);
        for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
            const file = JSON.parse(readFileSync(join(dir, name), 'utf8'));
            if (file.formulaVersion !== version) {
                throw new Error(`formula corpus ${version}/${name}: formulaVersion "${file.formulaVersion}" ≠ directory`);
            }
            const inputs = reviveInputs(file.inputs);
            if (inputs.formulaVersion != null && inputs.formulaVersion !== file.formulaVersion) {
                throw new Error(`formula corpus ${version}/${name}: inputs.formulaVersion "${inputs.formulaVersion}" ≠ file key "${file.formulaVersion}"`);
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
                    mappedBaselinedMh: asBigint(file.expected.mappedBaselinedMh, 'expected.mappedBaselinedMh'),
                    ...(file.expected.pvMh !== undefined
                        ? { pvMh: asBigint(file.expected.pvMh, 'expected.pvMh') }
                        : {}),
                    ...(file.expected.evMh !== undefined
                        ? { evMh: asBigint(file.expected.evMh, 'expected.evMh') }
                        : {}),
                },
            });
        }
    }
    return out;
}
/** Corpus root on disk (for tests that assert layout). */
export function formulaCorpusRoot() {
    return CORPUS_ROOT;
}
