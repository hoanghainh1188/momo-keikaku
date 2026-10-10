import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { baselineSetState, getProjectReview, requestContext } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours, hoursSigned, present, share, wholePercent, yen } from '@momo/domain/present';
import { FormulaMetricCell } from '@/components/formula-metric-cell';
import { EvmFormulaRow } from '@/components/evm-formula-row';
import { HealthBadge, Internal, MetricCell, Section, UnplannedChip } from '@/components/ui';
import {
  interpretationText,
  toFormulaPopoverModel,
  type FormulaMetricDetailLike,
} from '@/lib/review-formula-popover';
import { ScopeLedgerBar } from '@/components/scope-ledger-bar';
import { DispositionRail } from '@/components/disposition-rail';
import { ReviewPinRegistrar } from '@/components/review-pin-context';
import { SetBaselineButton } from '@/components/set-baseline-button';
import { UnmappedGroupRows } from '@/components/unmapped-group-rows';
import { REPORT_LOCALE } from '@/lib/report-locale';
import { divergenceStatusTags } from '@/lib/divergence-status-tags';
import { AcceptObservedPctForm } from '@/components/accept-observed-pct-form';
import { OverlapResolveForm } from '../connectors/overlap-resolve-form';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const em = t('common.em_dash');
  const money = (jpy: Parameters<typeof yen>[0]) => yen(jpy, REPORT_LOCALE);
  const { projectId } = await params;
  const ctx = await requestContext();
  const [{ bundle, review: r }, baselineState] = await Promise.all([
    getProjectReview({ projectId }, ctx).then(valueOrNotFound),
    baselineSetState(projectId, ctx).then(valueOrNotFound),
  ]);
  const p = bundle.project;
  const period = bundle.input.period;
  const leafWps = bundle.wps.filter((w) => w.isLeaf && !w.isMilestone);
  const overlaps = bundle.meta.overlaps;
  const leftScopeTickets = bundle.meta.leftScopeTickets;
  // Story 5.10: only LIVE rules have a row (an anchor) on the Mapping page.
  const liveRuleIds = new Set(bundle.rules.map((rule) => rule.id));

  const overall = r.health.overall;
  // Story 2.2 (decision Q1-A): with no Baseline these are null, and each block that needs them
  // shows the "No Baseline yet" state instead. Coverage, AC and Unplanned Work always render.
  const { evm, forecast, milestones, divergence, observedVsRecorded, pmAdjusted } = r;
  const recordedSourceLabel = (source: 'none' | 'pm_override' | 'plan_edit') =>
    source === 'none'
      ? t('review.gap_source_none')
      : source === 'pm_override'
        ? t('review.gap_source_pm_override')
        : t('review.gap_source_plan_edit');
  const evmMoney = r.money;
  const formulaDetail = (id: string): FormulaMetricDetailLike | undefined =>
    r.formulaMetrics?.find((m) => m.id === id);
  const formulaPopover = (id: string, formula: string) => {
    const d = formulaDetail(id);
    if (!d) return null;
    return toFormulaPopoverModel(d, formula, t);
  };
  const formulaReading = (id: string, fallback: string) => {
    const text = interpretationText(formulaDetail(id), t);
    return text || fallback;
  };
  const noBaseline = (section: string) => (
    <div className="caption" data-testid={`no-baseline-${section}`}>
      <p>
        <span className="tag">{t('review.no_baseline_yet')}</span>
      </p>
      <p className="caption" style={{ marginTop: 4 }}>
        {t('review.no_baseline_yet_detail')}
      </p>
      {section === 'status' ? (
        <div style={{ marginTop: 8 }}>
          <SetBaselineButton
            projectId={projectId}
            canSet={baselineState.canSet}
            hasBaseline={baselineState.hasBaseline}
            notSchedulableCount={baselineState.notSchedulableCount}
            blockingWpIds={baselineState.blockingWpIds}
            exceptionsRailHref={baselineState.exceptionsRailHref}
            testId="review-set-baseline"
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="layout-review">
      {r.snapshot.id ? <ReviewPinRegistrar snapshotId={r.snapshot.id} /> : null}
      <div className="sheet">
        <header>
          <h1 className="report-title" data-testid="report-title">
            {t('review.report_title', { projectName: p.name })}
          </h1>
          <div className="report-sub">
            {t('review.meta.report_sub_period', {
              period: period.label,
              tz: tz(p.tzOffsetMinutes),
              contractType: p.contractType,
              clientName: p.clientName,
            })}
          </div>
          <div className="report-sub" style={{ marginTop: 8 }}>
            {t('review.pinned_to_tracker_snapshot')}
            <code>{r.snapshot.id}</code> ·{' '}
            {t('review.meta.tickets_in_scope', { count: r.snapshot.ticketCount })} ·{' '}
            {t('review.meta.connector')} <em>{bundle.meta.connector.spaceLabel}</em> ·{' '}
            {t('review.meta.measurement_basis')} <strong>{r.measurementBasis}</strong>
            {r.measurementBasis === 'count' ? (
              <>
                {' '}
                <span data-testid="review-ticket-count-mode">({t('review.ticket_count_mode')})</span>
              </>
            ) : null}{' '}
            ·{' '}
            {t('review.meta.formula')} {r.formulaVersion}
          </div>
          <div className="btn-row">
            <Link className="btn" href={`/p/${projectId}/mapping`}>{t('review.mapping')}</Link>
            <Link className="btn" href={`/p/${projectId}/plan`}>{t('review.plan')}</Link>
          </div>
        </header>

        {overlaps.length > 0 ? (
          <div className="connector-error-banner" role="alert" data-testid="review-overlap-banner">
            <strong>{t('review.overlap_title')}</strong>
            <p>{t('review.overlap_intro')}</p>
            <ul>
              {overlaps.map((o) => (
                <OverlapResolveForm
                  key={o.id}
                  projectId={projectId}
                  trackerIssueId={o.trackerIssueId}
                  claimerConnectorId={o.claimerConnectorId}
                  ticketKey={o.ticketKey}
                  ownerLabel={o.ownerConnectorId}
                  claimerLabel={o.claimerConnectorId}
                  copyNamespace="review"
                />
              ))}
            </ul>
          </div>
        ) : null}

        {r.latestScopeChanges.length > 0 ? (
          <details data-testid="review-scope-changes" style={{ marginBottom: 16 }} open>
            <summary>
              <strong>{t('review.scope_change_title')}</strong>
              {' — '}
              {t('review.scope_change_intro')}
            </summary>
            <ul>
              {r.latestScopeChanges.map((change) => (
                <li key={change.connectorId} data-testid={`scope-change-${change.connectorId}`}>
                  {t('review.scope_change_row', {
                    label: change.label,
                    previous: change.previousScope,
                    next: change.newScope,
                  })}
                  {change.leftScopeTickets.length > 0 ? (
                    <ul>
                      {change.leftScopeTickets.map((ticket) => (
                        <li key={ticket.ticketId}>
                          {t('review.scope_change_left_ticket', {
                            key: ticket.key,
                            hours: hours(ticket.hoursMh),
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {leftScopeTickets.length > 0 ? (
          <details data-testid="review-left-scope-list" style={{ marginBottom: 16 }}>
            <summary>
              <strong>{t('review.left_scope_title')}</strong>
              {' — '}
              {t('review.left_scope_intro')}
            </summary>
            <ul>
              {leftScopeTickets.map((row) => (
                <li key={row.trackerIssueId}>
                  {t('review.left_scope_row', {
                    key: row.key,
                    hours: hours(row.hoursMh),
                  })}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <Section
          title={t('clientView.status')}
          id="status"
          intro={t('review.the_overall_status_is_the_worst_of_the_three_ind')}
        >
          <div style={{ marginBottom: 16 }} data-testid="overall-status">
            <span className="label">{t('clientView.overall')}</span>{' '}
            <HealthBadge colour={overall} word={overall} label={overall} />
            {r.health.overallNote ? (
              <span className="caption"> · {r.health.overallNote}</span>
            ) : null}
            <span className="caption" data-testid="health-threshold-source">
              {' '}
              · {t('review.health.threshold_source', { source: r.health.resolvedThresholds.source })}
            </span>
          </div>
          <div className="health-row">
            {r.health.indicators.map((i) => (
              <div className="health" key={i.key} data-testid={`health-${i.key}`}>
                <div className="label">{t(`review.health.${i.key}`)}</div>
                <div style={{ margin: '6px 0 4px' }}>
                  <HealthBadge
                    colour={i.colour}
                    word={i.colour}
                    label={`${i.colour} · ${i.driver}`}
                    disclosure={i.disclosure}
                    disclosureTitle={t('review.health.disclosure_title')}
                    closeLabel={t('review.metric_formula.close')}
                  />
                </div>
                <div className="caption">{i.rule}</div>
                {/* Story 6.6 / Q1→A: SV + both finishes under/beside Schedule HealthBadge (FR-31). */}
                {i.key === 'schedule' && evm !== null && forecast !== null ? (
                  <div className="metric-row" style={{ marginTop: 12 }} data-testid="schedule-finish-context">
                    <FormulaMetricCell
                      label={t('review.sv_schedule_variance')}
                      metric={evm.svMh}
                      formula={t('review.metrics.formula_sv')}
                      note={
                        evm.svMh.kind === 'value'
                          ? t(
                              evm.svMh.value < 0n
                                ? 'review.metrics.behind_plan_cap'
                                : 'review.metrics.ahead_of_plan',
                            )
                          : undefined
                      }
                      testId="m-status-sv"
                      popover={formulaPopover('sv', t('review.metrics.formula_sv'))}
                    />
                    <MetricCell
                      label={t('review.computed_finish')}
                      metric={{ text: forecast.computedFinish ?? em }}
                      formula={t('review.metrics.formula_computed_finish')}
                      note={t('review.metrics.note_computed_finish')}
                      testId="m-status-computed-finish"
                    />
                    <MetricCell
                      label={t('review.trend_finish')}
                      metric={{ text: forecast.trendFinish ?? forecast.forecastFinish ?? em }}
                      formula={t('review.metrics.formula_forecast_trend')}
                      note={t('review.metrics.note_forecast_finish', {
                        baselineFinish: forecast.baselineFinish ?? em,
                        note: forecast.note,
                      })}
                      testId="m-status-trend-finish"
                    />
                  </div>
                ) : null}
                {i.key === 'schedule' &&
                forecast !== null &&
                forecast.finishGapWd !== null ? (
                  <p className="caption" data-testid="status-finish-gap" style={{ marginTop: 8 }}>
                    {t('review.finishes_disagree', {
                      absGap: Math.abs(forecast.finishGapWd),
                      direction: forecast.finishGapWd > 0 ? 'later' : 'earlier',
                    })}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {evm === null ? noBaseline('status') : null}
          <div className="metric-row" style={{ marginTop: 24 }}>
            {evm === null ? null : (
              <>
                <FormulaMetricCell
                  xl
                  label={t('review.spi')}
                  metric={evm.spi}
                  formula={t('review.metrics.formula_spi')}
                  note={`${present(evm.evMh).text}h ÷ ${present(evm.pvMh).text}h — ${t(r.behindPlan ? 'review.metrics.behind_plan' : 'review.metrics.on_or_ahead_of_plan')}`}
                  testId="m-spi"
                  popover={formulaPopover('spi', t('review.metrics.formula_spi'))}
                />
                <FormulaMetricCell
                  xl
                  label={t('review.cpi_all_in')}
                  metric={evm.cpiAllIn}
                  formula={t('review.metrics.formula_cpi_all_in')}
                  note={t('review.metrics.note_cpi_all_in', { ev: present(evm.evMh).text, ac: present(evm.acMh).text })}
                  testId="m-cpi-allin"
                  popover={formulaPopover('cpi_all_in', t('review.metrics.formula_cpi_all_in'))}
                />
                <FormulaMetricCell
                  xl
                  label={t('review.cpi_planned_scope')}
                  metric={evm.cpiPlannedScope}
                  formula={t('review.metrics.formula_cpi_planned')}
                  note={t('review.metrics.note_cpi_gap')}
                  testId="m-cpi-planned"
                  popover={formulaPopover('cpi_planned', t('review.metrics.formula_cpi_planned'))}
                />
              </>
            )}
            <MetricCell
              xl
              tone="unplanned"
              label={t('review.unplanned_work_period')}
              metric={{
                text: r.unplanned.sharePeriod === null ? em : share(r.unplanned.sharePeriod),
              }}
              formula={
                r.measurementBasis === 'count'
                  ? t('review.metrics.formula_unplanned_period_tickets', {
                      unplanned: r.unplanned.ticketCountPeriod ?? 0,
                      total: r.unplanned.sharePeriod ? Number(r.unplanned.sharePeriod.den) : 0,
                    })
                  : t('review.metrics.formula_unplanned_period', {
                      unplanned: hours(r.unplanned.period.unplannedMh),
                      total: hours(r.unplanned.period.totalMh),
                    })
              }
              note={
                r.unplanned.shareCumulative === null
                  ? undefined
                  : r.measurementBasis === 'count'
                    ? t('review.metrics.note_unplanned_cumulative_tickets', {
                        share: share(r.unplanned.shareCumulative),
                      })
                    : t('review.metrics.note_unplanned_cumulative', {
                        share: share(r.unplanned.shareCumulative),
                        hours: hours(r.unplanned.cumulative.unplannedMh),
                      })
              }
              testId="m-unplanned-share"
            />
          </div>
        </Section>

        <Section
          title={t('review.unplanned_work')}
          id="unplanned"
          intro={t('review.hours_spent_outside_the_baselined_plan_they_carr')}
        >
          <ScopeLedgerBar
            segments={r.scopeLedger}
            openingBalanceMh={r.openingBalanceMh}
            totalMh={r.attribution.cumulative.totalMh}
          />

          <p className="caption" style={{ marginTop: 12 }} data-testid="sm-c1-catch-all-share">
            {r.catchAllShare.kind === 'unavailable'
              ? t('review.sm_c1_catch_all_share_unavailable', {
                  reason: r.catchAllShare.reasonCode,
                })
              : t('review.sm_c1_catch_all_share', {
                  share: share(r.catchAllShare.value),
                })}
          </p>

          <h3 className="label" style={{ marginTop: 32 }}>{t('review.the_three_components_of_unplanned_work_cumulativ')}</h3>
          <table className="ledger" data-testid="unplanned-components">
            <thead>
              <tr>
                <th>{t('review.component')}</th>
                <th className="num">{t('mapping.hours')}</th>
                <th className="num">{t('review.share_of_unplanned')}</th>
                <th>{t('review.where_it_comes_from')}</th>
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
                    {c.share === null ? em : share(c.share)}
                  </td>
                  <td className="caption">{t(`review.componentSource.${componentSourceKey(c.key)}`)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>{t('review.total_unplanned_work')}</td>
                <td className="num" data-testid="unplanned-total-cum">
                  {hours(r.unplanned.cumulative.unplannedMh)}
                  <span className="unit">h</span>
                </td>
                <td className="num">{t('review.percent_complete_total')}</td>
                <td className="caption">
                  <Internal />{' '}
                  {t('review.unplanned.total_row_rates', {
                    amount: money(r.unplanned.cumulative.unplannedJpy),
                  })}
                </td>
              </tr>
            </tbody>
          </table>

          {r.openingBalanceByConnector.length > 0 ? (
            <ul
              className="caption"
              style={{ marginTop: 8, paddingLeft: 18 }}
              data-testid="review-opening-balance-by-connector"
            >
              {r.openingBalanceByConnector.map((row) => (
                <li key={row.connectorId}>
                  {t('review.unplanned.opening_balance_connector', {
                    label: row.label,
                    hours: hours(row.mh),
                  })}
                </li>
              ))}
            </ul>
          ) : null}

          <h3 className="label" style={{ marginTop: 32 }}>{t('review.unmapped_work_by_tracker_attribute_expand_to_tic')}</h3>
          <table className="ledger" data-testid="unmapped-groups">
            <thead>
              <tr>
                <th>{t('review.group')}</th>
                <th>{t('review.attribute')}</th>
                <th className="num">{t('mapping.tickets')}</th>
                <th className="num">{t('mapping.hours')}</th>
                <th>{t('review.disposition.column_header')}</th>
              </tr>
            </thead>
            <tbody>
              {r.unmappedGroups.map((g) => (
                <UnmappedGroupRows key={g.key} group={g} />
              ))}
              <tr className="total-row">
                <td colSpan={2}>{t('review.total_unmapped_work')}</td>
                <td className="num">{r.coverage.unmappedTickets}</td>
                <td className="num" data-testid="unmapped-total">
                  {hours(r.unplanned.cumulative.unmappedMh)}
                  <span className="unit">h</span>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="caption" style={{ marginTop: 8 }} data-testid="review-mapping-coverage">
            {r.coverage.mappedHourShare.kind === 'unavailable'
              ? t('review.unplanned.mapping_coverage_hour_unavailable', {
                  hourReason: t(
                    `mapping.ledger.unavailable.${r.coverage.mappedHourShare.reasonCode}` as 'mapping.ledger.unavailable.tracker_provides_no_hours',
                  ),
                  ticketShare: share(r.coverage.mappedTicketShare),
                })
              : t('review.unplanned.mapping_coverage', {
                  hourShare: share(r.coverage.mappedHourShare.value),
                  ticketShare: share(r.coverage.mappedTicketShare),
                })}
          </p>

          {r.ruleUnmapped.length > 0 && (
            <>
              {/* Story 5.10 / UX-DR23 / Q3: flagged for as long as the Ticket stays unmapped. */}
              <h3 className="label" style={{ marginTop: 24 }}>{t('review.rule_unmapped.heading')}</h3>
              <ul data-testid="rule-unmapped" style={{ margin: '4px 0', paddingLeft: 18 }}>
                {r.ruleUnmapped.map((row) => (
                  <li key={row.ticketId} data-testid={`rule-unmapped-${row.ticketId}`}>
                    <strong>{row.key}</strong> {row.title} —{' '}
                    {row.ruleId === null ? (
                      t('review.rule_unmapped.unknown_rule')
                    ) : !liveRuleIds.has(row.ruleId) ? (
                      // A soft-deleted rule is not listed on the Mapping page: name it, no link.
                      t('review.rule_unmapped.row', { rule: row.ruleName ?? row.ruleId })
                    ) : (
                      <Link href={`/p/${projectId}/mapping#rule-${row.ruleId}`}>
                        {t('review.rule_unmapped.row', { rule: row.ruleName ?? row.ruleId })}
                      </Link>
                    )}
                    {/* Ticket-Count Mode carries no hours — never render them as 0 (story 5.7). */}
                    {r.measurementBasis === 'hours' && (
                      <span className="caption">
                        {' '}
                        {hours(row.mh)}
                        <span className="unit">h</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="caption">{t('review.rule_unmapped.caption')}</p>
            </>
          )}
        </Section>

        <Section title={t('review.ahead_behind')} id="ahead-behind">
          {evm === null || forecast === null || milestones === null || divergence === null ? (
            noBaseline('ahead-behind')
          ) : (
            <>
              <div className="metric-row">
                <FormulaMetricCell
                  label={t('review.sv_schedule_variance')}
                  metric={evm.svMh}
                  formula={t('review.metrics.formula_sv')}
                  note={t(
                    evm.svMh.kind === 'value' && evm.svMh.value < 0n
                      ? 'review.metrics.behind_plan_cap'
                      : 'review.metrics.ahead_of_plan',
                  )}
                  testId="m-sv"
                  popover={formulaPopover('sv', t('review.metrics.formula_sv'))}
                />
                <FormulaMetricCell
                  label={t('review.spi')}
                  metric={evm.spi}
                  formula={t('review.metrics.formula_spi')}
                  popover={formulaPopover('spi', t('review.metrics.formula_spi'))}
                />
                <MetricCell
                  label={t('review.computed_finish')}
                  metric={{ text: forecast.computedFinish ?? em }}
                  formula={t('review.metrics.formula_computed_finish')}
                  note={t('review.metrics.note_computed_finish')}
                  testId="m-computed-finish"
                />
                <MetricCell
                  label={t('review.trend_finish')}
                  metric={{ text: forecast.trendFinish ?? forecast.forecastFinish ?? em }}
                  formula={t('review.metrics.formula_forecast_trend')}
                  note={t('review.metrics.note_forecast_finish', {
                    baselineFinish: forecast.baselineFinish ?? em,
                    note: forecast.note,
                  })}
                  testId="m-forecast-finish"
                />
              </div>
              {forecast.finishGapWd !== null ? (
                <p className="caption" data-testid="ahead-behind-finish-gap" style={{ marginTop: 8 }}>
                  {t('review.finishes_disagree', {
                    absGap: Math.abs(forecast.finishGapWd),
                    direction: forecast.finishGapWd > 0 ? 'later' : 'earlier',
                  })}
                </p>
              ) : null}

              <h3 className="label" style={{ marginTop: 32 }}>{t('clientView.milestones')}</h3>
              <table className="ledger" data-testid="milestones">
                <thead>
                  <tr>
                    <th>{t('clientView.wbs')}</th>
                    <th>{t('clientView.milestone')}</th>
                    <th>{t('review.baseline_date')}</th>
                    <th>{t('clientView.done')}</th>
                    <th>{t('clientView.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr key={m.wbsCode}>
                      <td>{m.wbsCode}</td>
                      <td>{m.name}</td>
                      <td>{m.baselineDate}</td>
                      <td>{m.doneDate ?? em}</td>
                      <td>
                        {m.doneDate ? (
                          <span className="tag done">{t('clientView.done')}</span>
                        ) : m.slipped ? (
                          <HealthBadge colour="amber" label={t('clientView.slipped')} />
                        ) : (
                          <span className="tag">{t('clientView.open')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 className="label" style={{ marginTop: 32 }}>{t('review.divergence_by_work_package_baseline_vs_current_p')}</h3>
              <table className="ledger" data-testid="divergence">
                <thead>
                  <tr>
                    <th>{t('clientView.wbs')}</th>
                    <th>{t('clientView.work_package')}</th>
                    <th>{t('review.baseline_finish')}</th>
                    <th>{t('review.actual_finish')}</th>
                    <th className="num">{t('plan.baseline_h')}</th>
                    <th className="num">{t('review.ev_h')}</th>
                    <th className="num">{t('review.ac_h')}</th>
                    <th className="num">{t('common.percent_symbol')}</th>
                    <th>{t('review.basis')}</th>
                  </tr>
                </thead>
                <tbody>
                  {divergence
                    .filter((d) => d.acMh !== 0n || d.baselineMh > 0n)
                    .map((d) => (
                      <tr key={d.wpId}>
                        <td>{d.wbsCode}</td>
                        <td>
                          {d.name}{' '}
                          {d.isCatchAll ? <span className="tag">{t('plan.catch_all_loe')}</span> : null}
                          {d.nonBaselined ? (
                            <span className="tag unplanned">{t('plan.non_baselined')}</span>
                          ) : null}
                        </td>
                        <td>{d.baselineFinish ?? em}</td>
                        <td
                          style={
                            d.baselineFinish && d.actualFinish && d.actualFinish > d.baselineFinish
                              ? { color: 'var(--health-amber)' }
                              : undefined
                          }
                        >
                          {d.actualFinish ?? em}
                        </td>
                        <td className="num">{hours(d.baselineMh)}</td>
                        <td className="num">{hours(d.evMh)}</td>
                        <td className="num">{hours(d.acMh)}</td>
                        <td className="num">{wholePercent(d.pctComplete)}%</td>
                        <td>
                          <span className="tag">{d.pctBasis}</span>
                          {divergenceStatusTags({
                            lowEvidence: d.lowEvidence,
                            baselineMh: d.baselineMh,
                            evFell: d.evFell,
                            estimateDrivenEv: d.estimateDrivenEv,
                          }).map((tag) => (
                            <span
                              key={tag.key}
                              className="tag"
                              {...(tag.testId ? { 'data-testid': tag.testId } : {})}
                            >
                              {t(`review.${tag.key}`)}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="caption" style={{ marginTop: 8 }}>
                {t('review.divergence.footnote', {
                  leafCount: leafWps.length,
                  baselineCount: bundle.baseline?.wps.length ?? 0,
                })}
              </p>
            </>
          )}
        </Section>

        {/*
          Story 6.4 — thin Progress & Dates after Ahead/Behind: gap list + Accept only.
          Date-moved list + Data Date stay for 6.8 / 6.7.
          PM-adjusted marker: no Visibility Policy may hide it (contract stub until Publish).
        */}
        <Section
          title={t('review.progress_and_dates')}
          id="progress-dates"
          intro={t('review.progress_and_dates_intro')}
        >
          {observedVsRecorded === null ? (
            noBaseline('progress-dates')
          ) : (
            <>
              <h3 className="label">{t('review.observed_vs_recorded')}</h3>
              {observedVsRecorded.length === 0 ? (
                <p className="caption" data-testid="observed-vs-recorded-empty">
                  {t('review.gap_empty')}
                </p>
              ) : (
                <table className="ledger" data-testid="observed-vs-recorded">
                  <thead>
                    <tr>
                      <th>{t('clientView.wbs')}</th>
                      <th>{t('clientView.work_package')}</th>
                      <th>{t('review.gap_observed')}</th>
                      <th>{t('review.gap_recorded')}</th>
                      <th className="num">{t('review.gap_gap')}</th>
                      <th className="num">{t('review.gap_ev_obs')}</th>
                      <th className="num">{t('review.gap_ev_rec')}</th>
                      <th>{t('review.accept')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observedVsRecorded.map((row) => {
                      const observedWhole = wholePercent(row.observedPct);
                      const recordedWhole =
                        row.recordedPct === null ? wholePercent({ num: 0n, den: 1n }) : wholePercent(row.recordedPct);
                      const rowPmAdjusted =
                        row.recordedReason !== null && row.recordedReason.trim().length > 0;
                      return (
                        <tr key={row.wpId} data-testid={`gap-row-${row.wpId}`}>
                          <td>{row.wbsCode}</td>
                          <td>
                            {row.name}{' '}
                            {rowPmAdjusted ? (
                              <span className="tag" data-testid={`pm-adjusted-review-${row.wpId}`}>
                                {t('common.pm_adjusted')}
                              </span>
                            ) : null}
                            {row.estimateDrivenEv ? (
                              <span className="tag" data-testid={`estimate-driven-${row.wpId}`}>
                                {t('review.gap_estimate_driven')}
                              </span>
                            ) : null}
                            <div className="caption">
                              {t('review.gap_wording', {
                                observed: observedWhole,
                                recorded: recordedWhole,
                              })}
                            </div>
                          </td>
                          <td>
                            {observedWhole}%
                            <div className="caption">
                              <span className="tag">{row.pctBasis}</span>{' '}
                              {t('review.gap_evidence_count', { count: row.evidenceCount })}
                            </div>
                          </td>
                          <td>
                            {recordedWhole}%
                            <div className="caption">
                              {recordedSourceLabel(row.recordedSource)}
                            </div>
                          </td>
                          <td className="num">
                            {t('review.gap_pts', { pts: wholePercent(row.gapAbs) })}
                          </td>
                          <td className="num">{hours(row.evObservedMh)}</td>
                          <td className="num">{hours(row.evRecordedMh)}</td>
                          <td>
                            <AcceptObservedPctForm
                              row={{
                                projectId,
                                wpId: row.wpId,
                                wbsCode: row.wbsCode,
                                name: row.name,
                                observedWhole,
                                remainingBefore: row.remainingDaysBefore,
                                remainingAfter: row.remainingDaysAfter,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {pmAdjusted.length > 0 ? (
                <>
                  <h3 className="label" style={{ marginTop: 24 }}>
                    {t('review.pm_adjusted_list')}
                  </h3>
                  <ul data-testid="pm-adjusted-list" style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {pmAdjusted.map((row) => (
                      <li key={row.wpId} data-testid={`pm-adjusted-list-${row.wpId}`}>
                        <span className="tag">{t('common.pm_adjusted')}</span>{' '}
                        {row.wbsCode} · {row.name} — {wholePercent(row.recordedPct)}%
                        <span className="caption">
                          {' '}
                          ({recordedSourceLabel(row.source)}: {row.reason})
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </Section>

        <Section
          title={t('review.effort_cost')}
          id="effort-cost"
          intro={t('review.measured_in_effort_hours_the_money_column_is_der')}
        >
          {evm === null ? noBaseline('effort-cost') : null}
          <table className="ledger" data-testid="evm-table">
            <thead>
              <tr>
                <th>{t('review.metric')}</th>
                <th className="num">{t('mapping.hours')}</th>
                <th className="num">{t('review.money')}<Internal />
                </th>
                <th>{t('review.formula')}</th>
                <th>{t('review.reading')}</th>
              </tr>
            </thead>
            <tbody>
              {evm === null || evmMoney === null ? null : (
                <>
                  <EvmFormulaRow
                    name={t('review.evm.pv.name')}
                    value={`${present(evm.pvMh).text}h`}
                    money={money(evmMoney.pvJpy)}
                    formula={t('review.evm.pv.formula')}
                    reading={formulaReading('pv', t('review.evm.pv.reading'))}
                    popover={formulaPopover('pv', t('review.evm.pv.formula'))}
                  />
                  <EvmFormulaRow
                    name={t('review.evm.ev.name')}
                    value={`${present(evm.evMh).text}h`}
                    money={money(evmMoney.evJpy)}
                    formula={t('review.evm.ev.formula')}
                    reading={formulaReading('ev', t('review.evm.ev.reading'))}
                    testId="evm-ev"
                    popover={formulaPopover('ev', t('review.evm.ev.formula'))}
                  />
                </>
              )}
              <EvmFormulaRow
                name={t('review.evm.ac.name')}
                value={
                  evm !== null
                    ? evm.acMh.kind === 'value'
                      ? `${present(evm.acMh).text}h`
                      : present(evm.acMh).text
                    : `${hours(r.attribution.cumulative.totalMh)}h`
                }
                money={
                  evm !== null && evm.acMh.kind === 'unavailable'
                    ? ''
                    : money(r.attribution.cumulative.totalJpy)
                }
                formula={
                  evm !== null && evm.acMh.kind === 'unavailable'
                    ? (present(evm.acMh).unavailableReason ?? t('review.evm.ac.formula'))
                    : t('review.evm.ac.formula')
                }
                reading={
                  evm !== null && evm.acMh.kind === 'value' && evm.acMh.coverage
                    ? evm.acMh.coverage
                    : formulaReading('ac', t('review.evm.ac.reading'))
                }
                testId="evm-ac"
                popover={evm !== null ? formulaPopover('ac', t('review.evm.ac.formula')) : null}
              />
              {evm === null ? null : (
                <EvmRow
                  name={t('review.evm.planned_scope.name')}
                  value={`${hours(r.attribution.cumulative.mappedBaselinedMh + r.attribution.cumulative.catchAllMh)}h`}
                  money=""
                  formula={t('review.evm.planned_scope.formula')}
                  reading={t('review.evm.planned_scope.reading')}
                />
              )}
              <EvmRow
                name={t('review.evm.unplanned_line.name')}
                value={`${hours(r.attribution.cumulative.unplannedMh)}h`}
                money={money(r.attribution.cumulative.unplannedJpy)}
                formula={t('review.evm.unplanned_line.formula')}
                reading={t('review.evm.unplanned_line.reading')}
                unplanned
                testId="evm-unplanned-line"
              />
              {evm === null || evmMoney === null ? null : (
                <>
                  <EvmFormulaRow
                    name={t('review.evm.cv.name')}
                    value={evm.cvMh.kind === 'value' ? `${hoursSigned(evm.cvMh.value)}h` : present(evm.cvMh).text}
                    money=""
                    formula={t('review.evm.cv.formula')}
                    reading={formulaReading('cv', t('review.evm.cv.reading'))}
                    popover={formulaPopover('cv', t('review.evm.cv.formula'))}
                  />
                  <EvmFormulaRow
                    name={t('review.evm.sv.name')}
                    value={
                      evm.svMh.kind === 'value'
                        ? `${hoursSigned(evm.svMh.value)}h`
                        : present(evm.svMh).text
                    }
                    money=""
                    formula={t('review.evm.sv.formula')}
                    reading={formulaReading('sv', t('review.evm.sv.reading'))}
                    popover={formulaPopover('sv', t('review.evm.sv.formula'))}
                  />
                  <EvmFormulaRow
                    name={t('review.evm.cpi_all_in.name')}
                    value={present(evm.cpiAllIn).text}
                    money=""
                    formula={t('review.evm.cpi_all_in.formula')}
                    reading={formulaReading('cpi_all_in', t('review.evm.cpi_all_in.reading'))}
                    popover={formulaPopover('cpi_all_in', t('review.evm.cpi_all_in.formula'))}
                  />
                  <EvmFormulaRow
                    name={t('review.evm.cpi_planned.name')}
                    value={present(evm.cpiPlannedScope).text}
                    money=""
                    formula={t('review.evm.cpi_planned.formula')}
                    reading={formulaReading('cpi_planned', t('review.evm.cpi_planned.reading'))}
                    popover={formulaPopover('cpi_planned', t('review.evm.cpi_planned.formula'))}
                  />
                  <EvmFormulaRow
                    name={t('review.evm.tcpi.name')}
                    value={present(evm.tcpi).text}
                    money=""
                    formula={t('review.evm.tcpi.formula')}
                    reading={formulaReading('tcpi', t('review.evm.tcpi.reading'))}
                    testId="evm-tcpi"
                    popover={formulaPopover('tcpi', t('review.evm.tcpi.formula'))}
                  />
                  <EvmFormulaRow
                    name={t('review.evm.bac.name')}
                    value={`${hours(evm.bacMh)}h`}
                    money={money(evmMoney.bacJpy)}
                    formula={t('review.evm.bac.formula')}
                    reading={formulaReading('bac', t('review.evm.bac.reading'))}
                    popover={formulaPopover('bac', t('review.evm.bac.formula'))}
                  />
                </>
              )}
            </tbody>
          </table>
          <p className="caption" style={{ marginTop: 8 }}>
            {t('review.evm.cpi_money_footnote', {
              defaultRate: money(p.defaultRateYenPerHour),
            })}
          </p>
        </Section>

        <Section title={t('review.forecast')} id="forecast">
          {evm === null || forecast === null ? (
            noBaseline('forecast')
          ) : (
            <>
              <div className="metric-row">
                <FormulaMetricCell
                  label={t('review.eac_typical')}
                  metric={evm.eacMh}
                  formula={t('review.metrics.formula_eac')}
                  note={t('review.metrics.note_eac')}
                  testId="m-eac"
                  popover={formulaPopover('eac', t('review.metrics.formula_eac'))}
                />
                <FormulaMetricCell
                  label={t('review.etc')}
                  metric={evm.etcMh}
                  formula={t('review.metrics.formula_etc')}
                  testId="m-etc"
                  popover={formulaPopover('etc', t('review.metrics.formula_etc'))}
                />
                <FormulaMetricCell
                  label={t('review.vac')}
                  metric={evm.vacMh}
                  formula={t('review.metrics.formula_vac')}
                  note={t('review.metrics.note_vac')}
                  testId="m-vac"
                  popover={formulaPopover('vac', t('review.metrics.formula_vac'))}
                />
                <MetricCell
                  label={t('review.computed_finish')}
                  metric={{ text: forecast.computedFinish ?? em }}
                  formula={t('review.metrics.formula_computed_finish')}
                  note={t('review.metrics.note_computed_finish')}
                  testId="m-forecast-computed-finish"
                />
                <MetricCell
                  label={t('review.trend_finish')}
                  metric={{ text: forecast.trendFinish ?? forecast.forecastFinish ?? em }}
                  formula={t('review.metrics.formula_forecast_trend')}
                  note={t('review.metrics.note_forecast_finish', {
                    baselineFinish: forecast.baselineFinish ?? em,
                    note: forecast.note,
                  })}
                  testId="m-forecast-trend-finish"
                />
              </div>
              {forecast.finishGapWd !== null ? (
                <p className="caption" data-testid="forecast-finish-gap" style={{ marginTop: 8 }}>
                  {t('review.finishes_disagree', {
                    absGap: Math.abs(forecast.finishGapWd),
                    direction: forecast.finishGapWd > 0 ? 'later' : 'earlier',
                  })}
                </p>
              ) : null}
              <p className="caption" style={{ marginTop: 16 }}>{t('review.the_effort_forecast_is_the_eac_from_the_project_')}</p>
            </>
          )}
        </Section>
      </div>

      <DispositionRail
        projectId={projectId}
        groups={r.unmappedGroups.map((g) => ({
          key: g.key,
          label: g.label,
          ticketCount: g.ticketCount,
          hours: hours(g.mh),
          dispositioned: g.dispositioned,
          ticketIds: g.tickets.map((tk) => tk.ticketId),
        }))}
        leafWps={leafWps.map((w) => ({ id: w.id, label: `${w.wbsCode} ${w.name}` }))}
        explainNotes={r.explainNotes.map((n) => ({ note: n.note, hours: hours(n.mh) }))}
        unplannedHours={hours(r.unplanned.cumulative.unplannedMh)}
      />
    </div>
  );
}

function componentSourceKey(key: string): string {
  if (key === 'non-baselined') return 'non_baselined';
  if (key === 'catch-all-overflow') return 'catch_all_overflow';
  return key;
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
