'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { share, type Mh, type Ratio } from '@momo/domain/present';
import { ScopeLedgerBar } from '@/components/scope-ledger-bar';
import { MappingTicketBoard } from '@/components/mapping-ticket-board';
import {
  BUCKET_PAGE_SIZE,
  segmentsFor,
  ticketsInBucket,
  type CoverageConnectorView,
  type CoverageTicket,
} from '@/lib/mapping-coverage-model';
import { scopeSegmentMessageKey } from '@/lib/scope-segment-label';

export type { CoverageConnectorView, CoverageTicket };

/** How many Tickets the unfiltered Mapping list still shows (story 5.9 default). */
const UNFILTERED_LIMIT = 60;

export type CoverageView = {
  connectors: CoverageConnectorView[];
  projectTotal: CoverageConnectorView;
  sm5: { kind: 'value'; value: Ratio } | { kind: 'unavailable'; reasonCode: string };
};

type LeafWp = { readonly id: string; readonly label: string };

/**
 * Mapping › Coverage: one interactive Scope Ledger Bar per Connector plus Project total,
 * with segment filter over the paged Tickets list (story 5.11 / UX-DR18).
 */
export function MappingCoverage({
  projectId,
  coverage,
  openingBalanceMh,
  allTickets,
  leafWps,
  emDash,
}: {
  projectId: string;
  coverage: CoverageView;
  openingBalanceMh: Mh;
  allTickets: readonly CoverageTicket[];
  leafWps: readonly LeafWp[];
  emDash: string;
}) {
  const t = useTranslations();
  const rows = [...coverage.connectors, coverage.projectTotal];
  const [selectedId, setSelectedId] = useState(rows[0]?.connectorId ?? 'project-total');
  const [basis, setBasis] = useState<'hours' | 'tickets'>('hours');
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const selected = rows.find((r) => r.connectorId === selectedId) ?? rows[0]!;
  const { segments, unavailableReason, totalMh } = segmentsFor(selected, basis);

  const filtered = useMemo(() => {
    if (activeSegment === null) {
      return {
        tickets: allTickets.slice(0, UNFILTERED_LIMIT),
        total: allTickets.length,
        filtered: false as const,
      };
    }
    const result = ticketsInBucket(allTickets, {
      connectorId: selected.connectorId,
      basis,
      segmentKey: activeSegment,
      page,
    });
    return { ...result, filtered: true as const };
  }, [activeSegment, allTickets, basis, page, selected.connectorId]);

  function changeBasis(next: 'hours' | 'tickets') {
    setBasis(next);
    setActiveSegment(null);
    setPage(0);
  }

  function changeConnector(id: string) {
    setSelectedId(id);
    setActiveSegment(null);
    setPage(0);
  }

  function activateSegment(key: string | null) {
    setActiveSegment(key);
    setPage(0);
  }

  const sm5Text =
    coverage.sm5.kind === 'unavailable'
      ? t(
          `mapping.ledger.unavailable.${coverage.sm5.reasonCode}` as 'mapping.ledger.unavailable.project_younger_than_14_days',
        )
      : t('mapping.coverage_sm5', {
          share: share(coverage.sm5.value),
          target: '80%',
        });

  const pageCount = Math.max(1, Math.ceil(filtered.total / BUCKET_PAGE_SIZE));
  const mappedShare =
    selected.ticketShare.segments.find((s) => s.key === 'mapped')?.share ?? ({ num: 0n, den: 1n } as Ratio);

  return (
    <div data-testid="mapping-coverage">
      <div
        role="tablist"
        aria-label={t('mapping.coverage_connectors_aria')}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
      >
        {rows.map((r) => (
          <button
            key={r.connectorId}
            type="button"
            role="tab"
            className="btn"
            aria-selected={r.connectorId === selected.connectorId}
            data-testid={`coverage-tab-${r.connectorId}`}
            onClick={() => changeConnector(r.connectorId)}
          >
            {r.connectorId === 'project-total' ? t('mapping.coverage_project_total') : r.label}
          </button>
        ))}
      </div>

      <ScopeLedgerBar
        readOnly={false}
        segments={segments}
        openingBalanceMh={openingBalanceMh}
        totalMh={basis === 'hours' ? totalMh : 0n}
        basis={basis}
        onBasisChange={changeBasis}
        activeSegmentKey={activeSegment}
        onSegmentActivate={activateSegment}
        hourShareUnavailableReason={unavailableReason}
        titleKey="mapping.ledger.coverage_bar_title"
        showOpeningBalanceFootnote={basis === 'hours' && unavailableReason === null}
        footnoteKey="mapping.ledger.coverage_buckets_footnote"
      />

      <p className="caption" style={{ marginTop: 16 }} data-testid="coverage-summary">
        {selected.hourShare.kind === 'value'
          ? t('mapping.coverage_summary_v2', {
              hourShare: share(selected.hourShare.mappedExcludingCatchAll),
              ticketShare: share(mappedShare),
              catchAllTickets: selected.ticketShare.counts.catchAll,
              unmappedTickets: selected.ticketShare.counts.unmapped,
            })
          : t('mapping.coverage_summary_count_basis', {
              ticketShare: share(mappedShare),
              catchAllTickets: selected.ticketShare.counts.catchAll,
              unmappedTickets: selected.ticketShare.counts.unmapped,
              hourReason: t(
                `mapping.ledger.unavailable.${selected.hourShare.reasonCode}` as 'mapping.ledger.unavailable.tracker_provides_no_hours',
              ),
            })}
      </p>
      <p className="caption" data-testid="coverage-sm5">
        {sm5Text}
      </p>

      <p className="caption" style={{ marginTop: 8 }}>
        {t('mapping.coverage_filter_hint')}
      </p>

      {filtered.filtered ? (
        <>
          <h3 className="label" style={{ marginTop: 28 }} data-testid="coverage-filtered-heading">
            {t('mapping.coverage_filtered_tickets', {
              segment: activeSegment
                ? t(scopeSegmentMessageKey(basis, activeSegment))
                : '',
              total: filtered.total,
            })}
          </h3>
          <MappingTicketBoard
            projectId={projectId}
            leafWps={leafWps}
            tickets={filtered.tickets}
            emDash={emDash}
          />
          {filtered.total > BUCKET_PAGE_SIZE ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="btn"
                disabled={page <= 0}
                data-testid="coverage-page-prev"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t('mapping.ledger.page_prev')}
              </button>
              <span className="caption" data-testid="coverage-page-status">
                {t('mapping.ledger.page_status', { page: page + 1, pages: pageCount })}
              </span>
              <button
                type="button"
                className="btn"
                disabled={page + 1 >= pageCount}
                data-testid="coverage-page-next"
                onClick={() => setPage((p) => p + 1)}
              >
                {t('mapping.ledger.page_next')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
