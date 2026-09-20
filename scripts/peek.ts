import { buildDemoState, currentPeriod, asOfDate } from '../packages/db/src/fixtures.js';
import { computeReview, present, hours, share, ratio } from '../packages/domain/src/index.js';

const s = buildDemoState();
const period = currentPeriod(s);
const r = computeReview({
  project: s.project, calendar: s.calendar, wps: s.wps,
  baselineVersions: s.baselineVersions, activeBaselineSeq: s.activeBaselineSeq,
  ledger: s.ledger, mappingEvents: s.mappingEvents,
  pinnedSnapshot: s.snapshots[s.snapshots.length - 1]!,
  resources: s.resources, period, asOf: asOfDate(s), dispositions: [],
});
console.log('period', period.label, 'asOf', asOfDate(s));
console.log('BAC', hours(r.evm.bacMh), 'PV', hours(r.evm.pvMh), 'EV', hours(r.evm.evMh), 'AC', hours(r.evm.acMh));
console.log('SPI', present(r.evm.spi).text, 'CPI all-in', present(r.evm.cpiAllIn).text, 'CPI planned', present(r.evm.cpiPlannedScope).text);
console.log('TCPI', present(r.evm.tcpi).text, 'EAC', present(r.evm.eacMh).text, 'ETC', present(r.evm.etcMh).text, 'VAC', present(r.evm.vacMh).text);
console.log('unplanned period', hours(r.unplanned.period.unplannedMh), 'share', r.unplanned.sharePeriod === null ? '-' : share(r.unplanned.sharePeriod));
console.log('unplanned cum', hours(r.unplanned.cumulative.unplannedMh), 'share', r.unplanned.shareCumulative === null ? '-' : share(r.unplanned.shareCumulative));
console.log('components', r.unplanned.components.map(c => `${c.label}=${hours(c.mh)}h`).join(' | '));
console.log('opening balance', hours(r.openingBalanceMh));
console.log('period total', hours(r.attribution.period.totalMh), 'cum total', hours(r.attribution.cumulative.totalMh));
console.log('coverage tickets', share(r.coverage.mappedTicketShare), 'hours', share(r.coverage.mappedHourShare), 'unmapped tickets', r.coverage.unmappedTickets);
console.log('health', r.health.indicators.map(i => `${i.key}:${i.colour}`).join(' '), '=> overall', r.health.overall);
console.log('groups', r.unmappedGroups.map(g => `${g.label}(${g.ticketCount},${hours(g.mh)}h)`).join(' '));
console.log('milestones slipped', r.milestones.filter(m=>m.slipped).map(m=>m.name).join(','));
console.log('forecast', r.forecast.forecastFinish, 'baseline finish', r.forecast.baselineFinish);
