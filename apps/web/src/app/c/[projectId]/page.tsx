import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getClientView } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { HealthBadge } from '@/components/ui';
import { GanttRow, ganttScale } from '@/components/gantt';
import { formatReportDate, REPORT_LOCALE } from '@/lib/report-locale';

export const dynamic = 'force-dynamic';

/**
 * FR-34/FR-35/FR-36 preview. R0 renders the projection live; persisting a
 * Published Snapshot is R1 and is deliberately not built here.
 *
 * Everything on this page comes from the `getClientView` use case, whose projection
 * (`clientProjection`, default visibility) is a type with no money, Rate, person,
 * Tracker Account or Ticket-content fields — so the omission is checked by the
 * compiler rather than by discipline. The page computes nothing from the domain.
 */
export default async function ClientViewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const em = t('common.em_dash');
  const { projectId } = await params;
  const { clientName, projection: c } = valueOrNotFound(await getClientView({ projectId }));

  const dates = c.schedule
    .flatMap((s) => [s.baselineStart, s.baselineFinish, s.currentStart, s.currentFinish])
    .filter((d): d is string => Boolean(d))
    .sort();
  const scale = dates.length ? ganttScale(dates[0]!, dates[dates.length - 1]!) : null;

  return (
    <div style={{ padding: 24, background: 'var(--ground)', minHeight: '100vh' }}>
      <div className="client-sheet" data-testid="client-view">
        <div className="preview-band">{t('clientView.preview_not_published_this_is_exactly_what_a_cli')}</div>
        <div style={{ padding: 40 }}>
          <h1 className="report-title">{c.projectName}</h1>
          <div className="report-sub">
            {t('clientView.report_sub', {
              clientName,
              asOf: formatReportDate(c.asOf, REPORT_LOCALE),
            })}
          </div>

          <section className="section" style={{ marginTop: 32 }}>
            <h2 className="section-title">{t('clientView.status')}</h2>
            <hr className="section-rule" />
            <div style={{ marginBottom: 20 }}>
              <span className="label">{t('clientView.overall')}</span>{' '}
              <HealthBadge colour={c.overall} label={c.overall} />
            </div>
            <div className="health-row">
              {c.indicators.map((i) => (
                <div className="health" key={i.key} data-testid={`client-health-${i.key}`}>
                  <div className="label">{i.label}</div>
                  <div style={{ margin: '6px 0 4px' }}>
                    <HealthBadge colour={i.colour} label={`${i.colour} · ${i.driver}`} />
                  </div>
                  <div className="caption">{i.rule}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">{t('clientView.unplanned_work_title')}</h2>
            <hr className="section-rule" />
            <div className="metric" style={{ maxWidth: 320 }}>
              <div className="label">{t('clientView.this_reporting_period')}</div>
              <div
                className="value"
                style={{ color: 'var(--unplanned)', fontSize: 30 }}
                data-testid="client-unplanned"
              >
                {c.unplanned.sharePeriod ?? em}{' '}
                <span className="unit">({c.unplanned.hours} h)</span>
              </div>
              <div className="formula">{c.unplanned.statement}</div>
            </div>
            {c.unplanned.notes.length > 0 ? (
              <div style={{ marginTop: 20 }}>
                <div className="label">{t('clientView.from_your_project_manager')}</div>
                {c.unplanned.notes.map((n, i) => (
                  <p key={i} data-testid="client-note">
                    “{n}”
                  </p>
                ))}
              </div>
            ) : (
              <p className="caption" style={{ marginTop: 16 }}>{t('clientView.no_explanatory_note_has_been_attached_for_this_p')}</p>
            )}
            <p className="caption" style={{ marginTop: 16 }}>{t('clientView.the_unplanned_work_indicator_is_always_counted_i')}</p>
          </section>

          <section className="section">
            <h2 className="section-title">{t('clientView.milestones')}</h2>
            <hr className="section-rule" />
            <table className="ledger" data-testid="client-milestones">
              <thead>
                <tr>
                  <th>{t('clientView.milestone')}</th>
                  <th>{t('clientView.planned_baseline')}</th>
                  <th>{t('clientView.current')}</th>
                  <th>{t('clientView.done')}</th>
                  <th>{t('clientView.status')}</th>
                </tr>
              </thead>
              <tbody>
                {c.milestones.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.baselineDate}</td>
                    <td>{m.currentDate ?? em}</td>
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
          </section>

          <section className="section">
            <h2 className="section-title">{t('clientView.schedule')}</h2>
            <hr className="section-rule" />
            <table className="ledger" data-testid="client-schedule">
              <thead>
                <tr>
                  <th>{t('clientView.wbs')}</th>
                  <th>{t('clientView.work_package')}</th>
                  <th>{t('clientView.planned')}</th>
                  <th>{t('clientView.current')}</th>
                  <th className="num">{t('clientView.complete')}</th>
                  <th style={{ width: '34%' }}>{t('clientView.plan_vs_current')}</th>
                </tr>
              </thead>
              <tbody>
                {c.schedule.map((sch) => (
                  <tr key={sch.wbsCode}>
                    <td>{sch.wbsCode}</td>
                    <td>{sch.name}</td>
                    <td className="caption">
                      {sch.baselineStart ? `${sch.baselineStart} → ${sch.baselineFinish}` : em}
                    </td>
                    <td className="caption">
                      {sch.currentStart ? `${sch.currentStart} → ${sch.currentFinish}` : em}
                    </td>
                    <td className="num">{sch.progress.label}%</td>
                    <td>
                      {scale ? (
                        <GanttRow
                          scale={scale}
                          baseline={
                            sch.baselineStart && sch.baselineFinish
                              ? { start: sch.baselineStart, finish: sch.baselineFinish }
                              : null
                          }
                          current={
                            sch.currentStart && sch.currentFinish
                              ? { start: sch.currentStart, finish: sch.currentFinish }
                              : null
                          }
                          earned={sch.progress}
                          isMilestone={false}
                          slipped={false}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="section">
            <hr className="section-rule" />
            <p className="caption">{t('clientView.this_report_shows_effort_only_it_contains_no_cos')}</p>
            <p className="caption">
              <Link href={`/p/${projectId}/review`}>{t('clientView.back_to_review')}</Link>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
