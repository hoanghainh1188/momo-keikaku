import { getTranslations } from 'next-intl/server';
import { getProjectMapping } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { Internal, Section } from '@/components/ui';
import { MappingCoverage } from '@/components/mapping-coverage';
import { MappingTicketBoard } from '@/components/mapping-ticket-board';
import { MappingRulesEditor } from '@/components/mapping-rules-editor';

export const dynamic = 'force-dynamic';

/**
 * FR-21–FR-24: Tickets, Rules and Coverage on one surface. Story 5.9 adds Mapping DnD; story 5.10
 * makes the Rules editable; story 5.11 makes Coverage interactive per Connector.
 */
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

  const coverage = {
    connectors: m.coverageByConnector.connectors.map((c) => ({
      connectorId: c.connectorId,
      label: c.label,
      measurementBasis: c.measurementBasis,
      ticketShare: {
        counts: c.ticketShare.counts,
        segments: c.ticketShare.segments,
      },
      hourShare: c.hourShare,
    })),
    projectTotal: {
      connectorId: m.coverageByConnector.projectTotal.connectorId,
      label: m.coverageByConnector.projectTotal.label,
      measurementBasis: m.coverageByConnector.projectTotal.measurementBasis,
      ticketShare: {
        counts: m.coverageByConnector.projectTotal.ticketShare.counts,
        segments: m.coverageByConnector.projectTotal.ticketShare.segments,
      },
      hourShare: m.coverageByConnector.projectTotal.hourShare,
    },
    sm5:
      m.coverageByConnector.sm5.kind === 'value'
        ? { kind: 'value' as const, value: m.coverageByConnector.sm5.value }
        : {
            kind: 'unavailable' as const,
            reasonCode: m.coverageByConnector.sm5.reasonCode,
          },
  };

  return (
    <div className="sheet">
      <h1 className="report-title">{t('mapping.mapping_work_packages_tickets')}</h1>
      <div className="report-sub">{t('mapping.mappings_persist_across_tracker_snapshots_and_pl')}</div>

      <Section title={t('mapping.coverage')} id="coverage">
        <MappingCoverage
          projectId={projectId}
          coverage={coverage}
          openingBalanceMh={m.openingBalanceMh}
          allTickets={m.allTickets}
          leafWps={leafWps}
          emDash={em}
        />
      </Section>

      <Section
        title={t('mapping.mapping_rules')}
        id="rules"
        intro={t('mapping.rules_are_live_on_every_tracker_snapshot_each_ti')}
      >
        <MappingRulesEditor projectId={projectId} rules={m.rules} leafWps={leafWps} />
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
