'use client';

import { mapSingleTicket } from '@/app/actions';

/** FR-21: a Ticket maps to at most one leaf Work Package. "" unmaps it. */
export function MapTicketForm({
  projectId,
  ticketId,
  currentWpId,
  leafWps,
}: {
  projectId: string;
  ticketId: string;
  currentWpId: string;
  leafWps: { id: string; label: string }[];
}) {
  return (
    <form action={mapSingleTicket} style={{ display: 'flex', gap: 4, minWidth: 220 }}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <select name="wpId" defaultValue={currentWpId} aria-label={`Map ${ticketId}`}>
        <option value="">— unmapped —</option>
        {leafWps.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
          </option>
        ))}
      </select>
      <button className="btn" type="submit">
        Save
      </button>
    </form>
  );
}
