#!/usr/bin/env node
/**
 * One-shot merge for story 1.9 full page externalisation keys. Run once; delete if desired.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'packages/i18n/src/messages');
const enPath = path.join(dir, 'en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

Object.assign(en.plan, {
  baseline_recorded:
    'recorded {date} — "{reason}" · BAC {bac}h over {leafCount} baselined leaf Work Packages.',
});

Object.assign(en.baselines, {
  active_tag: 'active',
});

Object.assign(en.connectors, {
  adapter_replays: ' — replays recorded Backlog pages from ',
  snapshot_row: '{snapshotId} · {ticketCount} Tickets · {ageMinutes} min old',
  opening_balance_row:
    '{hours}h — hours the Tickets already carried before momo-keikaku could observe them',
});

Object.assign(en.mapping, {
  coverage_summary:
    '{hourShare} of hours mapped · {ticketShare} of Tickets mapped · {unmappedTickets} Unmapped Tickets. The share of Tickets and the share of hours are reported separately on purpose.',
  form: {
    ...en.mapping.form,
    unmapped_option: '— unmapped —',
    map_ticket_aria: 'Map {ticketId}',
  },
  ledger: {
    ...en.mapping.ledger,
    buckets_footnote:
      'The four buckets are mutually exclusive and sum to {totalHours}h — nothing in scope is silently excluded. Opening Balances ({openingHours}h) sit outside the bar and are reported separately.',
    segment_aria: '{label} {hours} hours, {share}',
    segment_title: '{label}: {hours}h ({share})',
  },
});

Object.assign(en.shell, {
  nav_aria_project_surfaces: 'Project surfaces',
});

Object.assign(en.common, {
  em_dash: '—',
  unit_hours: 'h',
  percent_symbol: '%',
});

Object.assign(en.review.disposition, {
  all_dispositioned: 'All Unmapped Work has a Disposition.',
  queue_waiting:
    '{count, plural, one {# group waiting} other {# groups waiting}}. Unplanned Work is {hours}h.',
  unmapped_tickets: '{count, plural, one {# Unmapped Ticket} other {# Unmapped Tickets}}',
  disposition_line: ' · disposition: {disposition}',
  explain_note_line: '“{note}” — {hours}h',
  map_tickets_submit: 'Map {count, plural, one {# Ticket} other {# Tickets}}',
  create_wp_map: 'Create WP & map',
  column_header: 'Disposition',
});

Object.assign(en.review, {
  report_title: '{projectName} — Reconciliation Review',
  percent_complete_total: '100.0%',
  meta: {
    report_sub_period:
      'Reporting Period {period} (weekly, teirei Thursday, {tz}) · Contract type {contractType} · Client {clientName}',
    tickets_in_scope: '{count, plural, one {# Ticket} other {# Tickets}} in scope',
    connector: 'Connector',
    measurement_basis: 'Measurement basis',
    formula: 'Formula',
  },
  metrics: {
    formula_spi: 'SPI = EV ÷ PV',
    formula_cpi_all_in: 'CPI = EV ÷ AC (all actual hours)',
    formula_cpi_planned: 'CPI = EV ÷ AC of baselined WPs only',
    note_spi: '{ev}h ÷ {pv}h — {behind, select, true {behind plan} other {on or ahead of plan}}',
    note_cpi_all_in: '{ev}h ÷ {ac}h — includes Unplanned Work',
    note_cpi_gap: 'The gap between the two CPIs is the Unplanned Work.',
    formula_unplanned_period: '{unplanned}h of {total}h this period',
    note_unplanned_cumulative: 'Cumulative {share} ({hours}h)',
    formula_sv: 'SV = EV − PV',
    note_sv: '{behind, select, true {Behind plan} other {Ahead of plan}}',
    formula_forecast_finish: 'Baseline start + (Baseline working days ÷ SPI)',
    note_forecast_finish: 'Baseline finish {baselineFinish} · {note}',
    formula_eac: 'EAC = BAC ÷ CPI (all-in)',
    note_eac: 'EAC Method: Typical — the only method in R0',
    formula_etc: 'ETC = EAC − AC',
    formula_vac: 'VAC = BAC − EAC',
    note_vac: 'Negative means the forecast overruns the budget',
    formula_forecast_trend: 'Trend heuristic, not a PMI formula',
  },
  unplanned: {
    total_row_rates: '{amount} at the Rates in effect when each hour was recorded',
    opening_balance_footnote:
      'Opening Balance {hours}h — hours the Tickets already carried before momo-keikaku could observe them. Counted in cumulative AC, excluded from period metrics, so a Project connected mid-flight shows no false spike.',
    mapping_coverage:
      'Mapping coverage: {hourShare} of hours and {ticketShare} of Tickets are mapped (FR-23 reports the two separately).',
  },
  divergence: {
    footnote:
      '{leafCount} leaf Work Packages in the Current Plan; {baselineCount} carry Baseline hours or are Milestones. Percent Complete is never derived from burned effort.',
  },
  evm: {
    cpi_money_footnote:
      'CPI in money can differ from CPI in hours, because the people planned and the people who did the work can have different Rates. Money above uses the Project default Rate of {defaultRate}/h for PV and EV, and the per-Resource Rate in effect for AC.',
    pv: {
      name: 'PV — Planned Value',
      formula: 'Baseline hours spread over baseline working days, to the as-of date',
      reading: 'What the Baseline said would be earned by now',
    },
    ev: {
      name: 'EV — Earned Value',
      formula: 'Σ Baseline hours × Percent Complete',
      reading: 'What has actually been earned',
    },
    ac: {
      name: 'AC — Actual Cost (all-in)',
      formula: 'Actuals Ledger, attributed by the current Mapping',
      reading: 'Includes the Unplanned line below',
    },
    planned_scope: {
      name: '— of which planned scope',
      formula: 'AC of baselined WPs (incl. Catch-all within its Baseline)',
      reading: '',
    },
    unplanned_line: {
      name: '— of which Unplanned (PV = EV = 0)',
      formula: 'Unmapped + non-baselined WPs + Catch-all overflow',
      reading: 'Actual effort with no earned value',
    },
    cv: {
      name: 'CV — Cost Variance',
      formula: 'CV = EV − AC',
      reading: '< 0 means over budget',
    },
    sv: {
      name: 'SV — Schedule Variance',
      formula: 'SV = EV − PV',
      reading: '< 0 means behind',
    },
    cpi_all_in: {
      name: 'CPI (all-in)',
      formula: 'CPI = EV ÷ AC',
      reading: '< 1 means over budget. This is the headline figure and the one every EAC uses.',
    },
    cpi_planned: {
      name: 'CPI (planned scope)',
      formula: 'CPI = EV ÷ AC of baselined WPs',
      reading:
        'Higher than all-in CPI: the planned work is close to plan; the overrun is Unplanned Work.',
    },
    tcpi: {
      name: 'TCPI',
      formula: 'TCPI = (BAC − EV) ÷ (BAC − AC)',
      reading: '> 1.1 means the remaining work must beat the planned efficiency — a red flag.',
    },
    bac: {
      name: 'BAC — Budget at Completion',
      formula: 'Σ Baseline hours over baselined leaf WPs',
      reading: '',
    },
  },
});

fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
fs.writeFileSync(path.join(dir, 'ja.json'), `${JSON.stringify(en, null, 2)}\n`);
console.log('merged story 1.9 i18n keys into en.json and ja.json');
