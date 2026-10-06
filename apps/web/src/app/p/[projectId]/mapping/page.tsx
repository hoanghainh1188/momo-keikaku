import { getTranslations } from 'next-intl/server';
import { getProjectMapping } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { share } from '@momo/domain/present';
import { Internal, Section } from '@/components/ui';
import { ScopeLedgerBar } from '@/components/scope-ledger-bar';
import { MappingTicketBoard } from '@/components/mapping-ticket-board';

export const dynamic = 'force-dynamic';

/** FR-21–FR-24: Tickets, Rules and Coverage on one surface. Story 5.9 adds Mapping DnD. */
export default async function MappingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const em = t('common.em_dash');
  const { projectId } = await params;
  // Rows arrive joined to their Work Package labels and ordered (`getProjectMapping`).
  const m = valueOrNotFound(await getProjectMapping({ projectId }));
  const leafWps = m.leafWps.map((w) => ({ id: w.id, label: w.label }));

  return (
    <div className="sheet">
      <h1 className="report-title">{t('mapping.mapping_work_packages_tickets')}</h1>
      <div className="report-sub">{t('mapping.mappings_persist_across_tracker_snapshots_and_pl')}</div>

      <Section title={t('mapping.coverage')} id="coverage">
        <ScopeLedgerBar
          segments={m.scopeLedger}
          openingBalanceMh={m.openingBalanceMh}
          totalMh={m.totalMh}
        />
        <p className="caption" style={{ marginTop: 16 }}>
          {t('mapping.coverage_summary', {
            hourShare: share(m.coverage.mappedHourShare),
            ticketShare: share(m.coverage.mappedTicketShare),
            unmappedTickets: m.coverage.unmappedTickets,
          })}
        </p>
      </Section>

      <Section
        title={t('mapping.mapping_rules')}
        id="rules"
        intro={t('mapping.rules_are_live_on_every_tracker_snapshot_each_ti')}
      >
        <table className="ledger" data-testid="rules-table">
          <thead>
            <tr>
              <th className="num">{t('mapping.priority')}</th>
              <th>{t('mapping.rule')}</th>
              <th>{t('mapping.condition')}</th>
              <th>{t('mapping.target_work_package')}</th>
              <th className="num">{t('mapping.tickets_mapped_now')}</th>
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
        <p className="caption" style={{ marginTop: 8 }}>{t('mapping.a_rule_showing_0_tickets_is_not_broken_those_tic')}</p>
      </Section>

      <Section
        title={t('mapping.tickets')}
        id="tickets"
        intro={t('mapping.the_60_tickets_carrying_the_most_hours_map_remap')}
      >
        <MappingTicketBoard
          projectId={projectId}
          leafWps={leafWps}
          tickets={m.tickets}
          emDash={em}
        />
        <p className="caption" style={{ marginTop: 8 }}>
          <Internal />{t('mapping.money_is_never_shown_on_client_surfaces_every_ma')}</p>
      </Section>
    </div>
  );
}
