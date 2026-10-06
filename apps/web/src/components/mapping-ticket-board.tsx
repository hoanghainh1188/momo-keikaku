'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useTransition } from 'react';

import { mapSingleTicket } from '@/app/actions';
import { MapTicketForm } from '@/components/map-ticket-form';
import { UnplannedChip } from '@/components/ui';
import { hours } from '@momo/domain/present';

type LeafWp = { readonly id: string; readonly label: string };

type TicketRow = {
  readonly trackerIssueId: string;
  readonly key: string;
  readonly title: string;
  readonly categoryIds: readonly string[];
  readonly statusId: string;
  readonly mh: bigint;
  readonly wpId: string | null;
  readonly wpLabel: string | null;
  readonly source: string;
};

/**
 * Story 5.9 / UX-DR25: HTML5 drag Tickets onto leaf WP drop targets, with keyboard Map as the
 * exact equivalent write path. MapTicketForm remains as a select+Save fallback (empty = release).
 */
export function MappingTicketBoard({
  projectId,
  leafWps,
  tickets,
  emDash,
}: {
  projectId: string;
  leafWps: readonly LeafWp[];
  tickets: readonly TicketRow[];
  emDash: string;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [dragTicketId, setDragTicketId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [keyboardTicketId, setKeyboardTicketId] = useState<string | null>(null);
  const chooserRef = useRef<HTMLSelectElement>(null);
  const chooserLabelId = useId();

  useEffect(() => {
    if (keyboardTicketId !== null) chooserRef.current?.focus();
  }, [keyboardTicketId]);

  function submitMap(ticketId: string, wpId: string) {
    if (pending) return;
    const fd = new FormData();
    fd.set('projectId', projectId);
    fd.set('ticketId', ticketId);
    fd.set('wpId', wpId);
    startTransition(() => {
      void mapSingleTicket(fd);
    });
  }

  function onDropLeaf(wpId: string) {
    if (pending) return;
    if (dragTicketId === null) return;
    submitMap(dragTicketId, wpId);
    setDragTicketId(null);
    setDropTargetId(null);
  }

  function openKeyboardMap(ticketId: string) {
    setKeyboardTicketId(ticketId);
  }

  function confirmKeyboardMap() {
    if (pending) return;
    if (keyboardTicketId === null || !chooserRef.current) return;
    const wpId = chooserRef.current.value;
    if (wpId === '') return;
    submitMap(keyboardTicketId, wpId);
    setKeyboardTicketId(null);
  }

  return (
    <div data-testid="mapping-ticket-board" aria-busy={pending || undefined}>
      <div
        className="mapping-drop-targets"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          opacity: pending ? 0.5 : 1,
          pointerEvents: pending ? 'none' : undefined,
        }}
        role="list"
        aria-label={t('mapping.dnd.drop_targets_aria')}
        aria-disabled={pending || undefined}
      >
        {leafWps.map((wp) => {
          const active = dropTargetId === wp.id;
          return (
            <div
              key={wp.id}
              role="listitem"
              data-testid={`mapping-drop-${wp.id}`}
              onDragOver={(e) => {
                if (pending) return;
                e.preventDefault();
                setDropTargetId(wp.id);
              }}
              onDragLeave={() => setDropTargetId((cur) => (cur === wp.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                onDropLeaf(wp.id);
              }}
              style={{
                border: active ? '2px solid var(--accent, #2563eb)' : '1px dashed var(--border, #94a3b8)',
                padding: '8px 12px',
                minWidth: 120,
                background: active ? 'color-mix(in srgb, var(--accent, #2563eb) 12%, transparent)' : undefined,
              }}
            >
              <span className="caption">{t('mapping.dnd.drop_hint')}</span>
              <div>{wp.label}</div>
            </div>
          );
        })}
      </div>

      {keyboardTicketId !== null && (
        <div
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}
          data-testid="mapping-keyboard-chooser"
        >
          <label id={chooserLabelId} htmlFor="mapping-keyboard-wp">
            {t('mapping.dnd.keyboard_chooser_label', { ticketId: keyboardTicketId })}
          </label>
          <select
            id="mapping-keyboard-wp"
            key={keyboardTicketId}
            ref={chooserRef}
            aria-labelledby={chooserLabelId}
            defaultValue=""
            disabled={pending}
          >
            <option value="" disabled>
              {t('mapping.dnd.keyboard_chooser_placeholder')}
            </option>
            {leafWps.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={confirmKeyboardMap} disabled={pending}>
            {t('mapping.dnd.keyboard_map_confirm')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setKeyboardTicketId(null)}
            disabled={pending}
          >
            {t('mapping.dnd.keyboard_map_cancel')}
          </button>
        </div>
      )}

      <table className="ledger" data-testid="tickets-table">
        <thead>
          <tr>
            <th>{t('mapping.ticket')}</th>
            <th>{t('mapping.title')}</th>
            <th>{t('mapping.category')}</th>
            <th>{t('clientView.status')}</th>
            <th className="num">{t('mapping.hours')}</th>
            <th>{t('mapping.mapped_to')}</th>
            <th>{t('mapping.source')}</th>
            <th>{t('mapping.change')}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.trackerIssueId}
              draggable={!pending}
              data-testid={`mapping-ticket-${ticket.trackerIssueId}`}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', ticket.trackerIssueId);
                setDragTicketId(ticket.trackerIssueId);
              }}
              onDragEnd={() => {
                setDragTicketId(null);
                setDropTargetId(null);
              }}
              style={{
                cursor: pending ? 'default' : 'grab',
                opacity: dragTicketId === ticket.trackerIssueId ? 0.6 : 1,
              }}
            >
              <td>{ticket.key}</td>
              <td>{ticket.title}</td>
              <td>{ticket.categoryIds.join(', ') || emDash}</td>
              <td>{ticket.statusId}</td>
              <td className="num">{hours(ticket.mh)}</td>
              <td>
                {ticket.wpLabel ?? <UnplannedChip>{t('mapping.unmapped')}</UnplannedChip>}
              </td>
              <td>
                <span className="tag">{ticket.source}</span>
              </td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={pending}
                    onClick={() => openKeyboardMap(ticket.trackerIssueId)}
                    aria-label={t('mapping.dnd.keyboard_map_aria', {
                      ticketId: ticket.trackerIssueId,
                    })}
                  >
                    {t('mapping.dnd.keyboard_map')}
                  </button>
                  <MapTicketForm
                    projectId={projectId}
                    ticketId={ticket.trackerIssueId}
                    currentWpId={ticket.wpId ?? ''}
                    leafWps={[...leafWps]}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
