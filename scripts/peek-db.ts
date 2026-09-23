import { DEMO_TENANT_ID, loadReview } from '../packages/db/src/repo.js';
import { closeAllPools, getDb } from '../packages/db/src/client.js';
import { hours, present, share } from '../packages/domain/src/index.js';
import { config } from '../packages/app/src/config.js';
// Reads as the restricted application role, through `withTenant`, exactly as the web app
// does — a peek that connected as the owner would not see what the app sees.
const { review: r, bundle } = await loadReview(getDb(config.APP_DATABASE_URL), DEMO_TENANT_ID);
console.log('anchor', bundle.meta.anchor, 'snapshot age(min)', bundle.meta.snapshotAgeMinutes);
if (r.evm === null) {
  // The seeded demo has no Baseline until Epic 4 (story 2.1, decision 2-A).
  console.log('no Baseline yet — AC', hours(r.attribution.cumulative.totalMh));
} else {
  console.log('SPI', present(r.evm.spi).text, 'CPI all-in', present(r.evm.cpiAllIn).text, 'CPI planned', present(r.evm.cpiPlannedScope).text, 'TCPI', present(r.evm.tcpi).text);
  console.log('BAC', hours(r.evm.bacMh), 'PV', hours(r.evm.pvMh), 'EV', hours(r.evm.evMh), 'AC', hours(r.evm.acMh));
}
console.log('unplanned period', hours(r.unplanned.period.unplannedMh), r.unplanned.sharePeriod && share(r.unplanned.sharePeriod));
console.log('components', r.unplanned.components.map(c=>`${c.label}=${hours(c.mh)}`).join(' | '));
console.log('health', r.health.indicators.map(i=>`${i.key}:${i.colour}`).join(' '), '->', r.health.overall);
await closeAllPools();
