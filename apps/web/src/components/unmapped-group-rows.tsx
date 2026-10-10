'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { hours, yen, type Jpy, type Mh } from '@momo/domain/present';
import { REPORT_LOCALE } from '@/lib/report-locale';
import { Internal, UnplannedChip } from './ui';

export function UnmappedGroupRows({
  projectId,
  group,
}: {
  projectId: string;
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
      jpy: Jpy;
      resolved: boolean;
      status: string;
    }[];
  };
}) {
  const t = useTranslations();
  const mappingHref = `/p/${projectId}/mapping`;
  return (
    <tr className="group-row" data-testid={`group-${group.key}`}>
      <td>
        <details>
          <summary>
            <UnplannedChip>{group.label}</UnplannedChip>
          </summary>
          <table className="ledger" style={{ marginTop: 8 }} data-testid={`unmapped-tickets-${group.key}`}>
            <thead>
              <tr>
                <th>{t('mapping.ticket')}</th>
                <th>{t('mapping.title')}</th>
                <th>{t('clientView.status')}</th>
                <th className="num">{t('mapping.hours')}</th>
                <th className="num">
                  {t('review.money')}
                  <Internal />
                </th>
              </tr>
            </thead>
            <tbody>
              {group.tickets.map((ticket) => (
                <tr className="ticket-row" key={ticket.ticketId} data-testid={`unmapped-ticket-${ticket.ticketId}`}>
                  <td>
                    <Link href={mappingHref} data-testid={`unmapped-ticket-link-${ticket.ticketId}`}>
                      {ticket.key}
                    </Link>
                  </td>
                  <td>{ticket.title}</td>
                  <td>{ticket.status}</td>
                  <td className="num">
                    {ticket.mh > 0n ? (
                      <Link href={mappingHref} data-testid={`unmapped-hours-link-${ticket.ticketId}`}>
                        {hours(ticket.mh)}
                        <span className="unit">h</span>
                      </Link>
                    ) : (
                      <>
                        {hours(ticket.mh)}
                        <span className="unit">h</span>
                      </>
                    )}
                  </td>
                  <td className="num" data-testid={`unmapped-money-${ticket.ticketId}`}>
                    {yen(ticket.jpy, REPORT_LOCALE)}
                  </td>
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
