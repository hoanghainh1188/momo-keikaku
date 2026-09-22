'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { crCandidate, explainTickets, mapTickets, planTickets } from '@/app/actions';

export interface RailGroup {
  key: string;
  label: string;
  ticketCount: number;
  hours: string;
  dispositioned: string | null;
  ticketIds: string[];
}

/**
 * FR-29: the Disposition queue. Map applies immediately and the Unplanned figures
 * update in place. Plan creates a WP in the Current Plan and states that the hours
 * stay Unplanned until the next Re-baseline.
 */
export function DispositionRail({
  projectId,
  groups,
  leafWps,
  explainNotes,
  unplannedHours,
}: {
  projectId: string;
  groups: RailGroup[];
  leafWps: { id: string; label: string }[];
  explainNotes: { note: string; hours: string }[];
  unplannedHours: string;
}) {
  const t = useTranslations();
  const queue = groups.filter((g) => !g.dispositioned);
  return (
    <aside className="rail" data-testid="disposition-rail">
      <h2>{t('review.disposition.dispositions')}</h2>
      <p className="caption">
        {queue.length === 0
          ? t('review.disposition.all_dispositioned')
          : t('review.disposition.queue_waiting', { count: queue.length, hours: unplannedHours })}
      </p>

      {groups.map((g) => (
        <GroupPanel key={g.key} projectId={projectId} group={g} leafWps={leafWps} />
      ))}

      {explainNotes.length > 0 ? (
        <div className="rail-group">
          <div className="label">{t('review.disposition.explain_notes')}</div>
          {explainNotes.map((n, i) => (
            <p className="caption" key={i} data-testid="explain-note">
              {t('review.disposition.explain_note_line', { note: n.note, hours: n.hours })}
            </p>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function GroupPanel({
  projectId,
  group,
  leafWps,
}: {
  projectId: string;
  group: RailGroup;
  leafWps: { id: string; label: string }[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState<null | 'map' | 'plan' | 'explain'>(null);
  const ticketIds = group.ticketIds.join(',');

  return (
    <div className="rail-group" data-testid={`rail-group-${group.key}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{group.label}</strong>
        <span className="num" style={{ color: 'var(--unplanned)' }}>
          {group.hours}
          <span className="unit">h</span>
        </span>
      </div>
      <div className="caption">
        {t('review.disposition.unmapped_tickets', { count: group.ticketCount })}
        {group.dispositioned
          ? t('review.disposition.disposition_line', { disposition: group.dispositioned })
          : ''}
      </div>

      <div className="btn-row">
        <button type="button" className="btn" onClick={() => setOpen(open === 'map' ? null : 'map')}>
          {t('review.mapping')}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(open === 'plan' ? null : 'plan')}>
          {t('review.plan')}
        </button>
        <form action={crCandidate}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="ticketIds" value={ticketIds} />
          <button type="submit" className="btn">
            {t('review.disposition.cr_candidate')}
          </button>
        </form>
        <button type="button" className="btn" onClick={() => setOpen(open === 'explain' ? null : 'explain')}>
          {t('review.disposition.explain_notes')}
        </button>
      </div>

      {open === 'map' ? (
        <form action={mapTickets} style={{ marginTop: 8 }} data-testid={`map-form-${group.key}`}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="ticketIds" value={ticketIds} />
          <label className="label" htmlFor={`wp-${group.key}`}>{t('review.disposition.map_to_leaf_work_package')}</label>
          <select id={`wp-${group.key}`} name="wpId" defaultValue={leafWps[0]?.id}>
            {leafWps.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
          <div className="btn-row">
            <button className="btn primary" type="submit">
              {t('review.disposition.map_tickets_submit', { count: group.ticketCount })}
            </button>
          </div>
          <p className="caption">{t('review.disposition.attribution_follows_the_current_mapping_so_these')}</p>
        </form>
      ) : null}

      {open === 'plan' ? (
        <form action={planTickets} style={{ marginTop: 8 }} data-testid={`plan-form-${group.key}`}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="ticketIds" value={ticketIds} />
          <label className="label" htmlFor={`name-${group.key}`}>{t('review.disposition.new_work_package_name')}</label>
          <input id={`name-${group.key}`} name="name" type="text" defaultValue={group.label} />
          <div className="btn-row">
            <button className="btn primary" type="submit">
              {t('review.disposition.create_wp_map')}
            </button>
          </div>
          <p className="caption">{t('review.disposition.counts_as_unplanned_work_until_the_next_re_basel')}</p>
        </form>
      ) : null}

      {open === 'explain' ? (
        <form
          action={explainTickets}
          style={{ marginTop: 8 }}
          data-testid={`explain-form-${group.key}`}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="ticketIds" value={ticketIds} />
          <label className="label" htmlFor={`note-${group.key}`}>{t('review.disposition.note')}</label>
          <textarea id={`note-${group.key}`} name="note" rows={3} maxLength={1000} />
          <div className="btn-row">
            <button className="btn primary" type="submit">{t('review.disposition.save_note')}</button>
          </div>
          <p className="caption">{t('review.disposition.clients_see_this_note_only_if_you_publish_it')}</p>
        </form>
      ) : null}
    </div>
  );
}
