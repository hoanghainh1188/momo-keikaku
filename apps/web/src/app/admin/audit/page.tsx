/**
 * Admin: Audit log (story 1.7 / NFR-A1). Filterable list of the Tenant's `audit_log` rows.
 * Ledger-Paper lighter: a real table, hairline rules, no cards. React text only (NFR-S8).
 */
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AUDIT_ACTIONS } from '@momo/app';
import { listAuditLog, requestContext } from '@/server/composition';

export const dynamic = 'force-dynamic';

interface SearchParams {
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requestContext();
  // Built field-by-field so apps/web never states an `actor:` object literal (web-composition
  // fence) — the filter value still comes only from the request query.
  const filters: {
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
  } = {};
  if (params.action) filters.action = params.action;
  if (params.actor) filters.actor = params.actor;
  if (params.from) filters.from = toIsoInstant(params.from);
  if (params.to) filters.to = toIsoInstant(params.to);

  const result = await listAuditLog(filters, ctx);
  if (!result.ok) {
    if (result.error.code === 'not_found') return notFound();
    // invalid_input: keep the form and show a filter error — never 404 a bad date range.
    return (
      <AuditLogShell params={params} filterError="Those filters are not valid. Check the dates and action.">
        <EmptyRows />
      </AuditLogShell>
    );
  }

  const page = result.value;
  return (
    <AuditLogShell params={params}>
      {page.rows.length === 0 ? (
        <EmptyRows />
      ) : (
        page.rows.map((row) => (
          <tr key={row.seq}>
            <td>{formatWhen(row.at)}</td>
            <td>{row.actorDisplay}</td>
            <td>
              <code>{row.action}</code>
            </td>
            <td>
              <code>{row.target}</code>
            </td>
            <td>
              <code className="audit-payload">{formatPayload(row.payload)}</code>
            </td>
          </tr>
        ))
      )}
    </AuditLogShell>
  );
}

function EmptyRows() {
  return (
    <tr>
      <td colSpan={5} style={{ color: 'var(--ink-muted)' }}>
        No audit rows match.
      </td>
    </tr>
  );
}

function AuditLogShell({
  params,
  filterError,
  children,
}: {
  params: SearchParams;
  filterError?: string;
  children: ReactNode;
}) {
  return (
    <div data-testid="audit-log">
      <h1 className="page-title">Audit log</h1>
      <p className="lede">Every change to reported numbers or to who can see them, in this Tenant.</p>

      <form className="audit-filters" method="get" data-testid="audit-filters">
        <label>
          Action
          <select name="action" defaultValue={params.action ?? ''}>
            <option value="">Any</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actor
          <input
            name="actor"
            type="text"
            defaultValue={params.actor ?? ''}
            placeholder="stored actor stamp"
            autoComplete="off"
          />
        </label>
        <label>
          From
          <input name="from" type="datetime-local" defaultValue={toLocalInput(params.from)} />
        </label>
        <label>
          To
          <input name="to" type="datetime-local" defaultValue={toLocalInput(params.to)} />
        </label>
        <button type="submit" className="btn">
          Filter
        </button>
      </form>

      {filterError ? (
        <p className="audit-filter-error" data-testid="audit-filter-error" role="alert">
          {filterError}
        </p>
      ) : null}

      <table className="ledger" data-testid="audit-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function formatWhen(at: Date): string {
  return at.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

/** React-escaped text display of a decoded payload — no raw HTML, no JSON.stringify. */
function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return '—';
  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload);
  }
  if (typeof payload === 'bigint') return payload.toString();
  if (Array.isArray(payload)) return `[${payload.map(formatPayload).join(', ')}]`;
  if (typeof payload === 'object') {
    return `{ ${Object.entries(payload as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${formatPayload(value)}`)
      .join(', ')} }`;
  }
  return String(payload);
}

/**
 * Normalise a filter instant for the use case. `datetime-local` has no zone — treat wall time
 * as Asia/Tokyo (same zone `formatWhen` uses). Values that already carry Z/offset parse as-is.
 */
function toIsoInstant(value: string): string {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  // Asia/Tokyo is UTC+9 year-round (no DST).
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString();
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in Asia/Tokyo wall time. */
function toLocalInput(value: string | undefined): string {
  if (!value) return '';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(parsed));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
