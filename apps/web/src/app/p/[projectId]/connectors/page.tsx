import { getProjectReview } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours } from '@momo/domain/present';
import { Section } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** FR-17, FR-19, FR-42: the fixture Connector and its snapshot history. */
export default async function ConnectorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { bundle, review } = valueOrNotFound(await getProjectReview({ projectId }));
  const c = bundle.meta.connector;
  return (
    <div className="sheet">
      <h1 className="report-title">Connectors</h1>
      <div className="report-sub">
        Connectors are read-only. The offshore team keeps working in Backlog; nothing is asked of
        them and nothing is ever written back.
      </div>
      <Section title="Backlog Connector" id="connector">
        <table className="ledger">
          <tbody>
            <tr><td className="label">Adapter</td><td><code>{c.adapter}</code> — replays recorded Backlog pages from <code>fixtures/backlog/ec-phase2/</code></td></tr>
            <tr><td className="label">Space</td><td>{c.spaceLabel}</td></tr>
            <tr><td className="label">Scope</td><td>{c.scope}</td></tr>
            <tr><td className="label">Hours detection</td><td>Detected from the data, never from the plan name: measurement basis <strong>{review.measurementBasis}</strong></td></tr>
            <tr><td className="label">Pinned snapshot</td><td>{review.snapshot.id} · {review.snapshot.ticketCount} Tickets · {bundle.meta.snapshotAgeMinutes} min old</td></tr>
            <tr><td className="label">Opening Balance</td><td>{hours(review.openingBalanceMh)}h — hours the Tickets already carried before momo-keikaku could observe them</td></tr>
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 12 }}>
          Not in this demo: credential entry and rotation, the scheduled snapshot job (pg-boss),
          on-demand refresh, and Tracker Account → Resource linking as a UI. The seed replays all
          six snapshots in one pass.
        </p>
      </Section>
    </div>
  );
}
