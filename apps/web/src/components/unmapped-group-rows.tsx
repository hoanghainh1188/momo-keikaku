'use client';

import { useTranslations } from 'next-intl';
import { hours, type Mh } from '@momo/domain/present';
import { UnplannedChip } from './ui';

export function UnmappedGroupRows({
  group,
}: {
  group: {
    key: string;
    label: string;
    attribute: string;
    ticketCount: number;
    mh: Mh;
    dispositioned: string | null;
    tickets: {
      ticketId: string;
      key: string;
      title: string;
      mh: Mh;
      resolved: boolean;
      status: string;
    }[];
  };
}) {
  const t = useTranslations();
  return (
    <tr className="group-row" data-testid={`group-${group.key}`}>
      <td>
        <details>
          <summary>
            <UnplannedChip>{group.label}</UnplannedChip>
          </summary>
          <table className="ledger" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>{t('mapping.ticket')}</th>
                <th>{t('mapping.title')}</th>
                <th>{t('clientView.status')}</th>
                <th className="num">{t('mapping.hours')}</th>
              </tr>
            </thead>
            <tbody>
              {group.tickets.map((ticket) => (
                <tr className="ticket-row" key={ticket.ticketId}>
                  <td>{ticket.key}</td>
                  <td>{ticket.title}</td>
                  <td>{ticket.status}</td>
                  <td className="num">{hours(ticket.mh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </td>
      <td className="caption">{group.attribute}</td>
      <td className="num">{group.ticketCount}</td>
      <td className="num">
        {hours(group.mh)}
        <span className="unit">h</span>
      </td>
      <td>
        {group.dispositioned ? (
          <span className="tag">{group.dispositioned}</span>
        ) : (
          <span className="caption">{t('review.not_dispositioned')}</span>
        )}
      </td>
    </tr>
  );
}
