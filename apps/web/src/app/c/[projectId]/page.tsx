import Link from 'next/link';
import { getClientView } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { HealthBadge } from '@/components/ui';
import { GanttRow, ganttScale } from '@/components/gantt';

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
        <div className="preview-band">
          Preview — not published · this is exactly what a Client Viewer would see
        </div>
        <div style={{ padding: 40 }}>
          <h1 className="report-title">{c.projectName}</h1>
          <div className="report-sub">
            {clientName} · Report as of {c.asOf.slice(0, 10)} · Effort in 工数 (h)
          </div>

          <section className="section" style={{ marginTop: 32 }}>
            <h2 className="section-title">Status</h2>
            <hr className="section-rule" />
            <div style={{ marginBottom: 20 }}>
              <span className="label">Overall</span>{' '}
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
            <h2 className="section-title">計画外作業 — Unplanned Work</h2>
            <hr className="section-rule" />
            <div className="metric" style={{ maxWidth: 320 }}>
              <div className="label">This reporting period</div>
              <div
                className="value"
                style={{ color: 'var(--unplanned)', fontSize: 30 }}
                data-testid="client-unplanned"
              >
                {c.unplanned.sharePeriod ?? '—'}{' '}
                <span className="unit">({c.unplanned.hours} h)</span>
              </div>
              <div className="formula">{c.unplanned.statement}</div>
            </div>
            {c.unplanned.notes.length > 0 ? (
              <div style={{ marginTop: 20 }}>
                <div className="label">From your project manager</div>
                {c.unplanned.notes.map((n, i) => (
                  <p key={i} data-testid="client-note">
                    “{n}”
                  </p>
                ))}
              </div>
            ) : (
              <p className="caption" style={{ marginTop: 16 }}>
                No explanatory note has been attached for this period yet.
              </p>
            )}
            <p className="caption" style={{ marginTop: 16 }}>
              The Unplanned Work indicator is always counted in the Health Indicators above. The
              project manager controls the notes and the level of detail, not whether it counts.
            </p>
          </section>

          <section className="section">
            <h2 className="section-title">Milestones</h2>
            <hr className="section-rule" />
            <table className="ledger" data-testid="client-milestones">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Planned (baseline)</th>
                  <th>Current</th>
                  <th>Done</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {c.milestones.map((m) => (
                  <tr key={m.name}>
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
          </section>

          <section className="section">
            <h2 className="section-title">Schedule</h2>
            <hr className="section-rule" />
            <table className="ledger" data-testid="client-schedule">
              <thead>
                <tr>
                  <th>WBS</th>
                  <th>Work Package</th>
                  <th>Planned</th>
                  <th>Current</th>
                  <th className="num">Complete</th>
                  <th style={{ width: '34%' }}>Plan vs current</th>
                </tr>
              </thead>
              <tbody>
                {c.schedule.map((sch) => (
                  <tr key={sch.wbsCode}>
                    <td>{sch.wbsCode}</td>
                    <td>{sch.name}</td>
                    <td className="caption">
                      {sch.baselineStart ? `${sch.baselineStart} → ${sch.baselineFinish}` : '—'}
                    </td>
                    <td className="caption">
                      {sch.currentStart ? `${sch.currentStart} → ${sch.currentFinish}` : '—'}
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
            <p className="caption">
              This report shows effort only. It contains no cost, no rates, no named staffing and
              no ticket content. Views of a published report are recorded.
            </p>
            <p className="caption">
              <Link href={`/p/${projectId}/review`}>← Back to the PM&apos;s Reconciliation Review</Link>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
