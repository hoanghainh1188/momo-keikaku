/**
 * i18n key for a Scope Ledger / Coverage segment. Domain returns the stable key as `label`;
 * UI must translate — never show the raw key (story 5.11).
 */
export function scopeSegmentMessageKey(
  basis: 'hours' | 'tickets',
  segmentKey: string,
): `mapping.ledger.hour_segments.${string}` | `mapping.ledger.ticket_segments.${string}` {
  const ns = basis === 'tickets' ? 'ticket_segments' : 'hour_segments';
  return `mapping.ledger.${ns}.${segmentKey}`;
}
