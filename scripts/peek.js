import { buildDemoState, currentPeriod, asOfDate } from '../packages/db/src/fixtures.js';
import { computeReview, present, hours, share } from '../packages/domain/src/index.js';
const s = buildDemoState();
const period = currentPeriod(s);
const r = computeReview({
    project: s.project, calendar: s.calendar, wps: s.wps,
    baselineVersions: s.baselineVersions, activeBaselineSeq: s.activeBaselineSeq,
    ledger: s.ledger, mappingEvents: s.mappingEvents,
    pinnedSnapshot: s.snapshots[s.snapshots.length - 1],
    resources: s.resources, period, asOf: asOfDate(s), dispositions: [],
    measurementBasis: 'hours',
    resolvedStatusIds: new Set(['Closed']),
});
console.log('period', period.label, 'asOf', asOfDate(s));
// The fixture carries its Baseline in memory, so these are present; the seeded database has none.
if (!r.evm || !r.forecast || !r.milestones)
    throw new Error('the fixture Review has no Baseline');
console.log('BAC', hours(r.evm.bacMh), 'PV', present(r.evm.pvMh).text, 'EV', present(r.evm.evMh).text, 'AC', present(r.evm.acMh).text);
console.log('SPI', present(r.evm.spi).text, 'CPI all-in', present(r.evm.cpiAllIn).text, 'CPI planned', present(r.evm.cpiPlannedScope).text);
console.log('TCPI', present(r.evm.tcpi).text, 'EAC', present(r.evm.eacMh).text, 'ETC', present(r.evm.etcMh).text, 'VAC', present(r.evm.vacMh).text);
console.log('unplanned period', hours(r.unplanned.period.unplannedMh), 'share', r.unplanned.sharePeriod === null ? '-' : share(r.unplanned.sharePeriod));
console.log('unplanned cum', hours(r.unplanned.cumulative.unplannedMh), 'share', r.unplanned.shareCumulative === null ? '-' : share(r.unplanned.shareCumulative));
console.log('components', r.unplanned.components.map(c => `${c.label}=${hours(c.mh)}h`).join(' | '));
console.log('opening balance', hours(r.openingBalanceMh));
console.log('period total', hours(r.attribution.period.totalMh), 'cum total', hours(r.attribution.cumulative.totalMh));
console.log('coverage tickets', share(r.coverage.mappedTicketShare), 'hours', r.coverage.mappedHourShare.kind === 'value'
    ? share(r.coverage.mappedHourShare.value)
    : `unavailable(${r.coverage.mappedHourShare.reasonCode})`, 'unmapped tickets', r.coverage.unmappedTickets);
console.log('health', r.health.indicators.map(i => `${i.key}:${i.colour}`).join(' '), '=> overall', r.health.overall);
console.log('groups', r.unmappedGroups.map(g => `${g.label}(${g.ticketCount},${hours(g.mh)}h)`).join(' '));
console.log('milestones slipped', r.milestones.filter(m => m.slipped).map(m => m.name).join(','));
console.log('forecast', r.forecast.forecastFinish, 'baseline finish', r.forecast.baselineFinish);
