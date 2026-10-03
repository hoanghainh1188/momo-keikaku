'use client';

import { useEffect, useState } from 'react';
import type { WhatMovedBandView } from '@/components/plan-grid-types';
import { formatPlanDate } from '@momo/domain/present';
import {
  formatWhatMovedAttribution,
  readWhatMovedDismissed,
  writeWhatMovedDismissed,
} from '@/lib/plan-strip-what-moved';
import { PLAN_GRID_SLOTS } from '@/lib/plan-grid-view';

export interface PlanWhatMovedBandProps {
  readonly projectId: string;
  readonly currentUserId: string;
  readonly band: WhatMovedBandView | null;
  /** Fire polite announce once when a new runSeq settles. */
  readonly announceToken: number;
  readonly onFocusWp: (wpId: string) => void;
  readonly onHighlightWps: (wpIds: readonly string[]) => void;
  readonly onPoliteAnnounce: (text: string) => void;
}

/**
 * What-moved band (UX-DR10) — summary, FR-28 groups, dismiss/persist, attribution.
 * No Undo (Q1→A). Polite announce goes only through onPoliteAnnounce (toolbar aria-live).
 */
export function PlanWhatMovedBand({
  projectId,
  currentUserId,
  band,
  announceToken,
  onFocusWp,
  onHighlightWps,
  onPoliteAnnounce,
}: PlanWhatMovedBandProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [announcedRunSeq, setAnnouncedRunSeq] = useState<number | null>(null);

  useEffect(() => {
    if (band === null) {
      setDismissed(false);
      setExpanded(false);
      return;
    }
    setDismissed(readWhatMovedDismissed(projectId, band.runSeq));
    setExpanded(false);
  }, [band?.runSeq, projectId, band]);

  useEffect(() => {
    if (band === null || announceToken === 0) return;
    // Same runSeq must not re-announce/highlight when the token bumps again.
    if (announcedRunSeq === band.runSeq) return;
    setAnnouncedRunSeq(band.runSeq);
    onPoliteAnnounce(band.politeAnnounce);
    if (!band.nothingMoved) {
      const ids = band.groups.flatMap((g) => g.entries.map((e) => e.wpId));
      onHighlightWps(ids);
    }
  }, [announceToken, announcedRunSeq, band, onHighlightWps, onPoliteAnnounce]);

  if (band === null || dismissed) {
    return (
      <div
        className="plan-what-moved-slot"
        data-testid={PLAN_GRID_SLOTS[2]}
        aria-hidden="true"
      />
    );
  }

  const nowMs =
    typeof performance !== 'undefined' ? performance.timeOrigin + performance.now() : 0;
  const attribution = formatWhatMovedAttribution({
    currentUserId,
    actorUserId: band.actorUserId,
    actorName: band.actorName,
    atIso: band.atIso,
    nowMs,
  });

  return (
    <div className="plan-what-moved" data-testid={PLAN_GRID_SLOTS[2]}>
      <div className="plan-what-moved-line">
        <span data-testid="what-moved-summary">
          {band.summaryLine}
          {attribution}
        </span>
        {!band.nothingMoved ? (
          <button
            type="button"
            className="plan-what-moved-see"
            data-testid="what-moved-see"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            See what moved
          </button>
        ) : null}
        <button
          type="button"
          className="plan-what-moved-dismiss"
          data-testid="what-moved-dismiss"
          onClick={() => {
            writeWhatMovedDismissed(projectId, band.runSeq);
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
      {expanded && !band.nothingMoved ? (
        <div className="plan-what-moved-panel" data-testid="what-moved-panel">
          {band.groups.map((group) => (
            <div key={group.cause} className="plan-what-moved-group">
              <h3>
                {group.cause}{' '}
                <span className="plan-what-moved-count">({group.entries.length})</span>
              </h3>
              <ul>
                {group.entries.map((entry) => (
                  <li key={entry.wpId}>
                    <button
                      type="button"
                      className="plan-what-moved-entry"
                      onClick={() => onFocusWp(entry.wpId)}
                    >
                      <span className="plan-what-moved-wbs">{entry.wbsCode}</span>{' '}
                      {entry.name}
                      <span className="plan-what-moved-dates">
                        {' '}
                        {formatPlanDate(entry.oldEarlyStart)}–
                        {formatPlanDate(entry.oldEarlyFinish)}
                        {' → '}
                        {formatPlanDate(entry.newEarlyStart)}–
                        {formatPlanDate(entry.newEarlyFinish)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
