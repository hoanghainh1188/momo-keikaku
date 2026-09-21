import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours } from '@momo/domain/present';
import { Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** FR-15, FR-16: Baseline history. Re-baseline is not wired in the demo. */
export default async function BaselinesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { bundle, review } = valueOrNotFound(await getProjectReview({ projectId }));
  return (
    <div className="sheet">
      <h1 className="report-title">Baselines</h1>
      <div className="report-sub">
        A Baseline is never edited. Every version is kept with its author, time and reason.
      </div>
      <Section title="History" id="baseline-history">
        <table className="ledger" data-testid="baseline-history">
          <thead>
            <tr>
              <th className="num">Seq</th>
              <th>Version</th>
              <th>Recorded</th>
              <th>Reason</th>
              <th className="num">Baselined leaf WPs</th>
              <th className="num">BAC</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {bundle.input.baselineVersions.map((b) => (
              <tr key={b.id}>
                <td className="num">{b.seq}</td>
                <td>{b.id}</td>
                <td>{b.recordedAt.slice(0, 10)}</td>
                <td>{b.reason}</td>
                <td className="num">{b.wps.filter((w) => w.baselineMh > 0n).length}</td>
                <td className="num">{hours(b.wps.reduce((total, w) => total + w.baselineMh, 0n))}h</td>
                <td>{b.seq === bundle.input.activeBaselineSeq ? <span className="tag done">active</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 12 }}>
          Whether an hour counts as baselined is judged against the Baseline version active when
          its ledger entry was recorded, so a Re-baseline never erases Unplanned history. The
          active Baseline is selected by sequence, never by comparing timestamps.
        </p>
        <p className="caption">
          Not in this demo: Set Baseline / Re-baseline actions and version comparison (FR-16).
          BAC today is {hours(review.evm.bacMh)}h.
        </p>
      </Section>
    </div>
  );
}
