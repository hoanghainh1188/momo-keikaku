import Link from 'next/link';
import { loadReview } from '@momo/db';
import { webDb, WEB_TENANT_ID } from '@/server/db';
import { hours, hoursSigned, present, share, yen } from '@momo/domain';
import { HealthBadge, Internal, MetricCell, Section, UnplannedChip } from '@/components/ui';
import { ScopeLedgerBar } from '@/components/scope-ledger-bar';
import { DispositionRail } from '@/components/disposition-rail';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { bundle, review: r } = await loadReview(webDb(), WEB_TENANT_ID, projectId);
  const p = bundle.project;
  const period = bundle.input.period;
  const leafWps = bundle.wps.filter((w) => w.isLeaf && !w.isMilestone);

  const overall = r.health.overall;
  const spi = present(r.evm.spi);
  const cpiAll = present(r.evm.cpiAllIn);

  return (
    <div className="layout-review">
      <div className="sheet">
        {/* ---------------------------------------------------------- header */}
        <header>
          <h1 className="report-title" data-testid="report-title">
            {p.name} — Reconciliation Review
          </h1>
          <div className="report-sub">
            Reporting Period {period.label} (weekly, teirei Thursday, {tz(p.tzOffsetMinutes)}) ·
            Contract type {p.contractType} · Client {p.clientName}
          </div>
          <div className="report-sub" style={{ marginTop: 8 }}>
            Pinned to Tracker Snapshot <code>{r.snapshot.id}</code> ·{' '}
            {r.snapshot.ticketCount} Tickets in scope · Connector{' '}
            <em>{bundle.meta.connector.spaceLabel}</em> · Measurement basis{' '}
            <strong>{r.measurementBasis}</strong> · Formula {r.formulaVersion}
          </div>
          <div className="btn-row">
            <Link className="btn" href={`/p/${projectId}/mapping`}>
              Mapping
            </Link>
            <Link className="btn" href={`/p/${projectId}/plan`}>
              Plan
            </Link>
            <Link className="btn primary" href={`/c/${projectId}`}>
              Preview client view
            </Link>
          </div>
        </header>

        {/* ---------------------------------------------------------- status */}
        <Section
          title="Status"
          id="status"
          intro="The overall status is the worst of the three indicators. Each shows the rule behind its colour."
        >
          <div style={{ marginBottom: 16 }} data-testid="overall-status">
            <span className="label">Overall</span>{' '}
            <HealthBadge colour={overall} label={overall} />
            {r.health.overallNote ? (
              <span className="caption"> · {r.health.overallNote}</span>
            ) : null}
          </div>
          <div className="health-row">
            {r.health.indicators.map((i) => (
              <div className="health" key={i.key} data-testid={`health-${i.key}`}>
                <div className="label">{healthLabel(i.key)}</div>
                <div style={{ margin: '6px 0 4px' }}>
                  <HealthBadge colour={i.colour} label={`${i.colour} · ${i.driver}`} />
                </div>
                <div className="caption">{i.rule}</div>
              </div>
            ))}
          </div>

          <div className="metric-row" style={{ marginTop: 24 }}>
            <MetricCell
              xl
              label="SPI"
              metric={r.evm.spi}
              formula="SPI = EV ÷ PV"
              note={`${hours(r.evm.evMh)}h ÷ ${hours(r.evm.pvMh)}h — ${spi.text !== '—' && Number(spi.text) < 1 ? 'behind plan' : 'on or ahead of plan'}`}
              testId="m-spi"
            />
            <MetricCell
              xl
              label="CPI (all-in)"
              metric={r.evm.cpiAllIn}
              formula="CPI = EV ÷ AC (all actual hours)"
              note={`${hours(r.evm.evMh)}h ÷ ${hours(r.evm.acMh)}h — includes Unplanned Work`}
              testId="m-cpi-allin"
            />
            <MetricCell
              xl
              label="CPI (planned scope)"
              metric={r.evm.cpiPlannedScope}
              formula="CPI = EV ÷ AC of baselined WPs only"
              note="The gap between the two CPIs is the Unplanned Work."
              testId="m-cpi-planned"
            />
            <MetricCell
              xl
              tone="unplanned"
              label="Unplanned Work (period)"
              metric={{
                text: r.unplanned.sharePeriod === null ? '—' : share(r.unplanned.sharePeriod),
              }}
              formula={`${hours(r.unplanned.period.unplannedMh)}h of ${hours(r.unplanned.period.totalMh)}h this period`}
              note={
                r.unplanned.shareCumulative === null
                  ? undefined
                  : `Cumulative ${share(r.unplanned.shareCumulative)} (${hours(r.unplanned.cumulative.unplannedMh)}h)`
              }
              testId="m-unplanned-share"
            />
          </div>
        </Section>

        {/* ------------------------------------------------- unplanned work */}
        <Section
          title="Unplanned Work"
          id="unplanned"
          intro="Hours spent outside the baselined plan. They carry actual effort and no earned value — this is information about how accurate the plan is, not a judgement of people."
        >
          <ScopeLedgerBar
            segments={r.scopeLedger}
            openingBalanceMh={r.openingBalanceMh}
            totalMh={r.attribution.cumulative.totalMh}
          />

          <h3 className="label" style={{ marginTop: 32 }}>
            The three components of Unplanned Work (cumulative)
          </h3>
          <table className="ledger" data-testid="unplanned-components">
            <thead>
              <tr>
                <th>Component</th>
                <th className="num">Hours</th>
                <th className="num">Share of Unplanned</th>
                <th>Where it comes from</th>
              </tr>
            </thead>
            <tbody>
              {r.unplanned.components.map((c) => (
                <tr key={c.key} data-testid={`component-${c.key}`}>
                  <td>
                    <UnplannedChip>{c.label}</UnplannedChip>
                  </td>
                  <td className="num">
                    {hours(c.mh)}
                    <span className="unit">h</span>
                  </td>
                  <td className="num">
                    {r.unplanned.cumulative.unplannedMh === 0
                      ? '—'
                      : share(c.mh / r.unplanned.cumulative.unplannedMh)}
                  </td>
                  <td className="caption">{COMPONENT_SOURCE[c.key]}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Total Unplanned Work</td>
                <td className="num" data-testid="unplanned-total-cum">
                  {hours(r.unplanned.cumulative.unplannedMh)}
                  <span className="unit">h</span>
                </td>
                <td className="num">100.0%</td>
                <td className="caption">
                  <Internal /> {yen(r.unplanned.cumulative.unplannedJpy)} at the Rates in
                  effect when each hour was recorded
                </td>
              </tr>
            </tbody>
          </table>

          <p className="caption" style={{ marginTop: 8 }}>
            Opening Balance {hours(r.openingBalanceMh)}h — hours the Tickets already carried
            before momo-keikaku could observe them. Counted in cumulative AC, excluded from
            period metrics, so a Project connected mid-flight shows no false spike.
          </p>

          <h3 className="label" style={{ marginTop: 32 }}>
            Unmapped Work by Tracker attribute — expand to Tickets
          </h3>
          <table className="ledger" data-testid="unmapped-groups">
            <thead>
              <tr>
                <th>Group</th>
                <th>Attribute</th>
                <th className="num">Tickets</th>
                <th className="num">Hours</th>
                <th>Disposition</th>
              </tr>
            </thead>
            <tbody>
              {r.unmappedGroups.map((g) => (
                <GroupRows key={g.key} group={g} />
              ))}
              <tr className="total-row">
                <td colSpan={2}>Total Unmapped Work</td>
                <td className="num">{r.coverage.unmappedTickets}</td>
                <td className="num" data-testid="unmapped-total">
                  {hours(r.unplanned.cumulative.unmappedMh)}
                  <span className="unit">h</span>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="caption" style={{ marginTop: 8 }}>
            Mapping coverage: {share(r.coverage.mappedHourShare)} of hours and{' '}
            {share(r.coverage.mappedTicketShare)} of Tickets are mapped (FR-23 reports the two
            separately).
          </p>
        </Section>

        {/* ------------------------------------------------- ahead / behind */}
        <Section title="Ahead / Behind" id="ahead-behind">
          <div className="metric-row">
            <MetricCell
              label="SV (schedule variance)"
              metric={{ text: hoursSigned(r.evm.svMh), unit: 'h' }}
              formula="SV = EV − PV"
              note={r.evm.svMh < 0 ? 'Behind plan' : 'Ahead of plan'}
              testId="m-sv"
            />
            <MetricCell label="SPI" metric={r.evm.spi} formula="SPI = EV ÷ PV" />
            <MetricCell
              label="Forecast finish"
              metric={{ text: r.forecast.forecastFinish ?? '—' }}
              formula="Baseline start + (Baseline working days ÷ SPI)"
              note={`Baseline finish ${r.forecast.baselineFinish ?? '—'} · ${r.forecast.note}`}
              testId="m-forecast-finish"
            />
          </div>

          <h3 className="label" style={{ marginTop: 32 }}>
            Milestones
          </h3>
          <table className="ledger" data-testid="milestones">
            <thead>
              <tr>
                <th>WBS</th>
                <th>Milestone</th>
                <th>Baseline date</th>
                <th>Current date</th>
                <th>Done</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {r.milestones.map((m) => (
                <tr key={m.wbsCode}>
                  <td>{m.wbsCode}</td>
                  <td>{m.name}</td>
                  <td>{m.baselineDate}</td>
                  <td>{m.currentDate ?? '—'}</td>
                  <td>{m.doneDate ?? '—'}</td>
                  <td>
                    {m.doneDate ? (
                      <span className="tag done">Done</span>
                    ) : m.slipped ? (
                      <HealthBadge colour="amber" label="slipped" />
                    ) : (
                      <span className="tag">open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="label" style={{ marginTop: 32 }}>
            Divergence by Work Package — Baseline vs Current Plan vs actual
          </h3>
          <table className="ledger" data-testid="divergence">
            <thead>
              <tr>
                <th>WBS</th>
                <th>Work Package</th>
                <th>Baseline finish</th>
                <th>Current finish</th>
                <th className="num">Baseline h</th>
                <th className="num">EV h</th>
                <th className="num">AC h</th>
                <th className="num">%</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              {r.divergence
                .filter((d) => d.acMh !== 0 || d.baselineMh > 0)
                .map((d) => (
                  <tr key={d.wpId}>
                    <td>{d.wbsCode}</td>
                    <td>
                      {d.name}{' '}
                      {d.isCatchAll ? <span className="tag">catch-all · LOE</span> : null}
                      {d.nonBaselined ? (
                        <span className="tag unplanned">non-baselined</span>
                      ) : null}
                    </td>
                    <td>{d.baselineFinish ?? '—'}</td>
                    <td
                      style={
                        d.baselineFinish && d.currentFinish && d.currentFinish > d.baselineFinish
                          ? { color: 'var(--health-amber)' }
                          : undefined
                      }
                    >
                      {d.currentFinish ?? '—'}
                    </td>
                    <td className="num">{hours(d.baselineMh)}</td>
                    <td className="num">{hours(d.evMh)}</td>
                    <td className="num">{hours(d.acMh)}</td>
                    <td className="num">{(d.pctComplete * 100).toFixed(0)}%</td>
                    <td>
                      <span className="tag">{d.pctBasis}</span>
                      {d.lowEvidence && d.baselineMh > 0 ? (
                        <span className="tag">low evidence</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="caption" style={{ marginTop: 8 }}>
            {leafWps.length} leaf Work Packages in the Current Plan; {bundle.baseline.wps.length}{' '}
            carry Baseline hours or are Milestones. Percent Complete is never derived from burned
            effort.
          </p>
        </Section>

        {/* ------------------------------------------------- effort & cost */}
        <Section
          title="Effort &amp; Cost"
          id="effort-cost"
          intro="Measured in effort hours (工数). The money column is derived (hours × Rate) and is internal only."
        >
          <table className="ledger" data-testid="evm-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num">Hours</th>
                <th className="num">
                  Money <Internal />
                </th>
                <th>Formula</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              <EvmRow
                name="PV — Planned Value"
                value={`${hours(r.evm.pvMh)}h`}
                money={yen(Math.round((r.evm.pvMh * p.defaultRateYenPerHour) / 1000))}
                formula="Baseline hours spread over baseline working days, to the as-of date"
                reading="What the Baseline said would be earned by now"
              />
              <EvmRow
                name="EV — Earned Value"
                value={`${hours(r.evm.evMh)}h`}
                money={yen(Math.round((r.evm.evMh * p.defaultRateYenPerHour) / 1000))}
                formula="Σ Baseline hours × Percent Complete"
                reading="What has actually been earned"
                testId="evm-ev"
              />
              <EvmRow
                name="AC — Actual Cost (all-in)"
                value={`${hours(r.evm.acMh)}h`}
                money={yen(r.attribution.cumulative.totalJpy)}
                formula="Actuals Ledger, attributed by the current Mapping"
                reading="Includes the Unplanned line below"
                testId="evm-ac"
              />
              <EvmRow
                name="— of which planned scope"
                value={`${hours(r.attribution.cumulative.mappedBaselinedMh + r.attribution.cumulative.catchAllMh)}h`}
                money=""
                formula="AC of baselined WPs (incl. Catch-all within its Baseline)"
                reading=""
              />
              <EvmRow
                name="— of which Unplanned (PV = EV = 0)"
                value={`${hours(r.attribution.cumulative.unplannedMh)}h`}
                money={yen(r.attribution.cumulative.unplannedJpy)}
                formula="Unmapped + non-baselined WPs + Catch-all overflow"
                reading="Actual effort with no earned value"
                unplanned
                testId="evm-unplanned-line"
              />
              <EvmRow
                name="CV — Cost Variance"
                value={r.evm.cvMh.kind === 'value' ? `${hoursSigned(r.evm.cvMh.value)}h` : '—'}
                money=""
                formula="CV = EV − AC"
                reading="< 0 means over budget"
              />
              <EvmRow
                name="SV — Schedule Variance"
                value={`${hoursSigned(r.evm.svMh)}h`}
                money=""
                formula="SV = EV − PV"
                reading="< 0 means behind"
              />
              <EvmRow
                name="CPI (all-in)"
                value={present(r.evm.cpiAllIn).text}
                money=""
                formula="CPI = EV ÷ AC"
                reading="< 1 means over budget. This is the headline figure and the one every EAC uses."
              />
              <EvmRow
                name="CPI (planned scope)"
                value={present(r.evm.cpiPlannedScope).text}
                money=""
                formula="CPI = EV ÷ AC of baselined WPs"
                reading="Higher than all-in CPI: the planned work is close to plan; the overrun is Unplanned Work."
              />
              <EvmRow
                name="TCPI"
                value={present(r.evm.tcpi).text}
                money=""
                formula="TCPI = (BAC − EV) ÷ (BAC − AC)"
                reading="> 1.1 means the remaining work must beat the planned efficiency — a red flag."
                testId="evm-tcpi"
              />
              <EvmRow
                name="BAC — Budget at Completion"
                value={`${hours(r.evm.bacMh)}h`}
                money=""
                formula="Σ Baseline hours over baselined leaf WPs"
                reading=""
              />
            </tbody>
          </table>
          <p className="caption" style={{ marginTop: 8 }}>
            CPI in money can differ from CPI in hours, because the people planned and the people
            who did the work can have different Rates. Money above uses the Project default Rate
            of {yen(p.defaultRateYenPerHour)}/h for PV and EV, and the per-Resource Rate in effect
            for AC.
          </p>
        </Section>

        {/* ------------------------------------------------- forecast */}
        <Section title="Forecast" id="forecast">
          <div className="metric-row">
            <MetricCell
              label="EAC (Typical)"
              metric={r.evm.eacMh}
              formula="EAC = BAC ÷ CPI (all-in)"
              note="EAC Method: Typical — the only method in R0"
              testId="m-eac"
            />
            <MetricCell
              label="ETC"
              metric={r.evm.etcMh}
              formula="ETC = EAC − AC"
              testId="m-etc"
            />
            <MetricCell
              label="VAC"
              metric={r.evm.vacMh}
              formula="VAC = BAC − EAC"
              note="Negative means the forecast overruns the budget"
              testId="m-vac"
            />
            <MetricCell
              label="Forecast finish"
              metric={{ text: r.forecast.forecastFinish ?? '—' }}
              formula="Trend heuristic, not a PMI formula"
            />
          </div>
          <p className="caption" style={{ marginTop: 16 }}>
            The effort forecast is the EAC from the Project&apos;s EAC Method, so it includes
            Unplanned Work.
          </p>
        </Section>

        <p className="caption" style={{ marginTop: 40 }}>
          Approximate — hours are derived from the difference between Tracker Snapshots, not from
          worklogs. Any breakdown by person or by day is approximate for that reason, and no view
          ranks or scores people by Unplanned Work.
        </p>
      </div>

      <DispositionRail
        projectId={projectId}
        groups={r.unmappedGroups.map((g) => ({
          key: g.key,
          label: g.label,
          ticketCount: g.ticketCount,
          hours: hours(g.mh),
          dispositioned: g.dispositioned,
          ticketIds: g.tickets.map((t) => t.ticketId),
        }))}
        leafWps={leafWps.map((w) => ({ id: w.id, label: `${w.wbsCode} ${w.name}` }))}
        explainNotes={r.explainNotes.map((n) => ({ note: n.note, hours: hours(n.mh) }))}
        unplannedHours={hours(r.unplanned.cumulative.unplannedMh)}
      />
    </div>
  );
}

const COMPONENT_SOURCE: Record<string, string> = {
  unmapped: 'Tickets in the Connector’s scope with no Mapping to a Work Package.',
  'non-baselined':
    'Work Packages that exist in the Current Plan but carry no Baseline hours — for example WPs created by the Plan disposition. Their hours stay Unplanned until a Re-baseline.',
  'catch-all-overflow':
    'A Catch-all Work Package is measured as Level of Effort. Hours beyond its Baseline hours are Unplanned Work, and appear only here, so they are never counted twice.',
};

function healthLabel(key: string): string {
  return key === 'schedule'
    ? 'Schedule'
    : key === 'effort_cost'
      ? 'Effort / Cost'
      : 'Unplanned Work';
}

function tz(offsetMinutes: number): string {
  return offsetMinutes === 540 ? 'JST' : `UTC+${offsetMinutes / 60}`;
}

function EvmRow({
  name,
  value,
  money,
  formula,
  reading,
  unplanned,
  testId,
}: {
  name: string;
  value: string;
  money: string;
  formula: string;
  reading: string;
  unplanned?: boolean;
  testId?: string;
}) {
  return (
    <tr data-testid={testId}>
      <td style={unplanned ? { color: 'var(--unplanned)', fontWeight: 500 } : undefined}>
        {unplanned ? <span className="hatch-swatch" style={{ marginRight: 6 }} aria-hidden /> : null}
        {name}
      </td>
      <td className="num" style={unplanned ? { color: 'var(--unplanned)' } : undefined}>
        {value}
      </td>
      <td className="num">{money}</td>
      <td className="caption">{formula}</td>
      <td className="caption">{reading}</td>
    </tr>
  );
}

function GroupRows({
  group,
}: {
  group: {
    key: string;
    label: string;
    attribute: string;
    ticketCount: number;
    mh: number;
    dispositioned: string | null;
    tickets: { ticketId: string; key: string; title: string; mh: number; resolved: boolean; status: string }[];
  };
}) {
  return (
    <>
      <tr className="group-row" data-testid={`group-${group.key}`}>
        <td>
          <details>
            <summary>
              <UnplannedChip>{group.label}</UnplannedChip>
            </summary>
            <table className="ledger" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th className="num">Hours</th>
                </tr>
              </thead>
              <tbody>
                {group.tickets.map((t) => (
                  <tr className="ticket-row" key={t.ticketId}>
                    <td>{t.key}</td>
                    <td>{t.title}</td>
                    <td>{t.status}</td>
                    <td className="num">{hours(t.mh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </td>
        <td className="caption">{group.attribute}</td>
        <td className="num">{group.ticketCount}</td>
        <td className="num">
          {hours(group.mh)}
          <span className="unit">h</span>
        </td>
        <td>
          {group.dispositioned ? (
            <span className="tag">{group.dispositioned}</span>
          ) : (
            <span className="caption">not dispositioned</span>
          )}
        </td>
      </tr>
    </>
  );
}
