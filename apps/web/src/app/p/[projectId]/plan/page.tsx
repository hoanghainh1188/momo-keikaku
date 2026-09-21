import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { earnedProgress, hours, type Mh } from '@momo/domain/present';
import { Section } from '@/components/ui';
import { GanttRow, ganttScale } from '@/components/gantt';

export const dynamic = 'force-dynamic';

/** FR-5, FR-7: the Current Plan as a tree grid with Baseline vs Current bars. */
export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { bundle, review: r } = valueOrNotFound(await getProjectReview({ projectId }));

  const baselineByWp = new Map(bundle.baseline.wps.map((b) => [b.wpId, b]));
  const acByWp = r.attribution.acByWp;
  const evByWp = new Map(r.evm.perWp.map((w) => [w.wpId, w]));

  // roll-ups (FR-5): summary WP effort and dates come from the children
  const children = new Map<string, typeof bundle.wps>();
  for (const w of bundle.wps) {
    if (!w.parentId) continue;
    children.set(w.parentId, [...(children.get(w.parentId) ?? []), w]);
  }
  const rollUp = (id: string): { mh: Mh; baselineMh: Mh; acMh: Mh; start: string | null; finish: string | null } => {
    const kids = children.get(id) ?? [];
    let mh = 0n;
    let baselineMh = 0n;
    let acMh = 0n;
    let start: string | null = null;
    let finish: string | null = null;
    for (const k of kids) {
      const sub = k.isLeaf
        ? {
            mh: k.plannedMh,
            baselineMh: baselineByWp.get(k.id)?.baselineMh ?? 0n,
            acMh: acByWp.get(k.id) ?? 0n,
            start: k.start,
            finish: k.finish,
          }
        : rollUp(k.id);
      mh += sub.mh;
      baselineMh += sub.baselineMh;
      acMh += sub.acMh;
      if (sub.start && (!start || sub.start < start)) start = sub.start;
      if (sub.finish && (!finish || sub.finish > finish)) finish = sub.finish;
    }
    return { mh, baselineMh, acMh, start, finish };
  };

  const allDates = bundle.wps
    .flatMap((w) => [w.start, w.finish])
    .concat(bundle.baseline.wps.flatMap((b) => [b.start, b.finish]))
    .filter((d): d is string => Boolean(d))
    .sort();
  const scale = ganttScale(allDates[0]!, allDates[allDates.length - 1]!);

  const roots = bundle.wps.filter((w) => !w.parentId);

  return (
    <div className="sheet">
      <h1 className="report-title">Plan — Work Breakdown Structure</h1>
      <div className="report-sub">
        Current Plan (solid indigo) against the active Baseline (hollow outline). The Baseline is
        never edited: plan changes go to the Current Plan, and the Baseline moves only through an
        explicit, reasoned Re-baseline.
      </div>
      <div className="report-sub" style={{ marginTop: 8 }}>
        Active Baseline <strong>{bundle.baseline.id}</strong> recorded{' '}
        {bundle.meta.baselineRecordedAt.slice(0, 10)} — “{bundle.meta.baselineReason}” · BAC{' '}
        {hours(r.evm.bacMh)}h over {bundle.baseline.wps.filter((b) => b.baselineMh > 0n).length}{' '}
        baselined leaf Work Packages.
      </div>

      <Section title="Tree &amp; schedule" id="wbs">
        <table className="ledger" data-testid="plan-tree">
          <thead>
            <tr>
              <th>WBS</th>
              <th>Work Package</th>
              <th className="num">Baseline h</th>
              <th className="num">Current plan h</th>
              <th className="num">Actual h</th>
              <th>Baseline dates</th>
              <th>Current dates</th>
              <th style={{ width: '32%' }}>
                Baseline vs Current {scale.from} → {scale.to}
              </th>
            </tr>
          </thead>
          <tbody>
            {roots.flatMap((root) => {
              const rows = [root, ...(children.get(root.id) ?? [])];
              return rows.map((w) => {
                const isSummary = !w.isLeaf;
                const b = baselineByWp.get(w.id);
                const agg = isSummary ? rollUp(w.id) : null;
                const baselineMh = agg ? agg.baselineMh : (b?.baselineMh ?? 0n);
                const plannedMh = agg ? agg.mh : w.plannedMh;
                const acMh = agg ? agg.acMh : (acByWp.get(w.id) ?? 0n);
                const start = agg ? agg.start : w.start;
                const finish = agg ? agg.finish : w.finish;
                const ev = evByWp.get(w.id);
                const slipped =
                  b && finish && finish > b.finish ? true : false;
                return (
                  <tr key={w.id} data-testid={`wp-${w.wbsCode}`}>
                    <td style={{ fontWeight: isSummary ? 600 : 400 }}>{w.wbsCode}</td>
                    <td
                      style={{
                        paddingLeft: isSummary ? 8 : 24,
                        fontWeight: isSummary ? 600 : 400,
                      }}
                    >
                      {w.name}
                      {w.isCatchAll ? <span className="tag">catch-all · LOE</span> : null}
                      {w.isMilestone ? <span className="tag">milestone</span> : null}
                      {!b && w.isLeaf ? <span className="tag unplanned">non-baselined</span> : null}
                    </td>
                    <td className="num">{baselineMh !== 0n ? hours(baselineMh) : '—'}</td>
                    <td className="num">{plannedMh !== 0n ? hours(plannedMh) : '—'}</td>
                    <td className="num">{acMh !== 0n ? hours(acMh) : '—'}</td>
                    <td className="caption">
                      {b ? `${b.start} → ${b.finish}` : '—'}
                    </td>
                    <td className="caption" style={slipped ? { color: 'var(--health-amber)' } : undefined}>
                      {start && finish ? `${start} → ${finish}` : '—'}
                    </td>
                    <td>
                      <GanttRow
                        scale={scale}
                        baseline={b ? { start: b.start, finish: b.finish } : null}
                        current={start && finish ? { start, finish } : null}
                        earned={earnedProgress(ev?.pctComplete)}
                        isMilestone={w.isMilestone}
                        slipped={
                          w.isMilestone && b ? !w.milestoneDoneAt && bundle.input.asOf > b.finish : false
                        }
                      />
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 12 }}>
          Summary rows roll up effort and dates from their children. Earned progress fills the
          Current Plan bar in ink from the left. Milestones are diamonds; a slipped milestone is
          drawn as a hollow red diamond.
        </p>
      </Section>
    </div>
  );
}
