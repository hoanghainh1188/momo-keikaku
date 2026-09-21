import { getProjectMapping } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { hours, share } from '@momo/domain/present';
import { Internal, Section, UnplannedChip } from '@/components/ui';
import { ScopeLedgerBar } from '@/components/scope-ledger-bar';
import { MapTicketForm } from '@/components/map-ticket-form';

export const dynamic = 'force-dynamic';

/** FR-21–FR-24: Tickets, Rules and Coverage on one surface. */
export default async function MappingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // Rows arrive joined to their Work Package labels and ordered (`getProjectMapping`).
  const m = valueOrNotFound(await getProjectMapping({ projectId }));
  const leafWps = m.leafWps.map((w) => ({ id: w.id, label: w.label }));

  return (
    <div className="sheet">
      <h1 className="report-title">Mapping — Work Packages ↔ Tickets</h1>
      <div className="report-sub">
        Mappings persist across Tracker Snapshots and Plan edits. Attribution follows the
        current Mapping, so a remap moves the hours immediately and the ledger itself is never
        rewritten.
      </div>

      <Section title="Coverage" id="coverage">
        <ScopeLedgerBar
          segments={m.scopeLedger}
          openingBalanceMh={m.openingBalanceMh}
          totalMh={m.totalMh}
        />
        <p className="caption" style={{ marginTop: 16 }}>
          {share(m.coverage.mappedHourShare)} of hours mapped ·{' '}
          {share(m.coverage.mappedTicketShare)} of Tickets mapped ·{' '}
          {m.coverage.unmappedTickets} Unmapped Tickets. The share of Tickets and the share of
          hours are reported separately on purpose.
        </p>
      </Section>

      <Section
        title="Mapping Rules"
        id="rules"
        intro="Rules are live: on every Tracker Snapshot each Ticket without a manual Mapping is re-evaluated in priority order. A manual Mapping always wins."
      >
        <table className="ledger" data-testid="rules-table">
          <thead>
            <tr>
              <th className="num">Priority</th>
              <th>Rule</th>
              <th>Condition</th>
              <th>Target Work Package</th>
              <th className="num">Tickets mapped now</th>
            </tr>
          </thead>
          <tbody>
            {m.rules.map((rule) => (
              <tr key={rule.id} data-testid={`rule-${rule.id}`}>
                <td className="num">{rule.priority}</td>
                <td>{rule.name}</td>
                <td>
                  <code>
                    {rule.match.field} = {rule.match.value}
                  </code>
                </td>
                <td>{rule.wpLabel}</td>
                <td className="num">{rule.currentlyMapped}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 8 }}>
          A rule showing 0 Tickets is not broken: those Tickets already carry a manual Mapping,
          which a rule never overrides.
        </p>
      </Section>

      <Section
        title="Tickets"
        id="tickets"
        intro="The 60 Tickets carrying the most hours. Map, remap or unmap; the Review updates in place."
      >
        <table className="ledger" data-testid="tickets-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th className="num">Hours</th>
              <th>Mapped to</th>
              <th>Source</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {m.tickets.map((t) => (
              <tr key={t.trackerIssueId}>
                <td>{t.key}</td>
                <td>{t.title}</td>
                <td>{t.categoryIds.join(', ') || '—'}</td>
                <td>{t.statusId}</td>
                <td className="num">{hours(t.mh)}</td>
                <td>
                  {t.wpLabel ?? <UnplannedChip>Unmapped</UnplannedChip>}
                </td>
                <td>
                  <span className="tag">{t.source}</span>
                </td>
                <td>
                  <MapTicketForm
                    projectId={projectId}
                    ticketId={t.trackerIssueId}
                    currentWpId={t.wpId ?? ''}
                    leafWps={leafWps}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption" style={{ marginTop: 8 }}>
          <Internal /> Money is never shown on client surfaces. Every Mapping change is recorded
          with its author and time in the audit log.
        </p>
      </Section>
    </div>
  );
}
