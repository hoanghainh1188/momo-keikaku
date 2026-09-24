'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import {
  completeWorkPackageAction,
  deleteWorkPackageAction,
  loadDeleteConfirmAction,
  loadFirstObservedAction,
  refuseDerivedDateAction,
  setProjectStartPlanAction,
  type PlanWriteOutcome,
} from '@/app/p/[projectId]/plan/actions';

/**
 * Story 2.10 thin plan controls (Q1 → B): complete / delete confirm / derived-date teaching
 * refuse. Full tree grid stays 2.13+.
 */

function refuseMessage(outcome: Extract<PlanWriteOutcome, { ok: false }>): string {
  if (outcome.details !== undefined) {
    const parts = Object.entries(outcome.details).map(
      ([key, values]) => `${key}: ${values.join(', ')}`,
    );
    if (parts.length > 0) return parts.join('; ');
  }
  return outcome.messageKey;
}

export function CompleteWpForm({
  projectId,
  wpId,
  dataDate,
  proposedFinish,
}: {
  readonly projectId: string;
  readonly wpId: string;
  readonly dataDate: string | null;
  /** Product-clock "today" proposed by the server (UX-DR13). */
  readonly proposedFinish: string;
}) {
  const formId = useId();
  const [pending, start] = useTransition();
  const [firstObserved, setFirstObserved] = useState<string | null>(null);
  const [actualStart, setActualStart] = useState('');
  const [actualFinish, setActualFinish] = useState(proposedFinish);
  const [acceptProposal, setAcceptProposal] = useState(false);
  const [advance, setAdvance] = useState(false);
  const [refuse, setRefuse] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFirstObservedAction(projectId, wpId).then((day) => {
      if (!cancelled) setFirstObserved(day);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, wpId]);

  const needsAdvance =
    dataDate !== null && actualFinish !== '' && actualFinish > dataDate;

  return (
    <form
      id={formId}
      className="caption"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 4 }}
      data-testid={`complete-wp-${wpId}`}
      action={(fd) => {
        start(async () => {
          setRefuse(null);
          const outcome = await completeWorkPackageAction(fd);
          if (!outcome.ok) setRefuse(refuseMessage(outcome));
        });
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="wpId" value={wpId} />
      <input type="hidden" name="acceptFirstObserved" value={acceptProposal ? '1' : '0'} />
      <label>
        Actual start{' '}
        <input
          name="actualStart"
          type="date"
          value={actualStart}
          onChange={(e) => {
            setActualStart(e.target.value);
            setAcceptProposal(false);
          }}
          data-testid="actual-start"
        />
      </label>
      {firstObserved !== null ? (
        <span data-testid="first-observed-evidence">
          First observed: {firstObserved}{' '}
          <button
            type="button"
            onClick={() => {
              setActualStart(firstObserved);
              setAcceptProposal(true);
            }}
            data-testid="accept-first-observed"
          >
            Use
          </button>
        </span>
      ) : null}
      <label>
        Actual finish{' '}
        <input
          name="actualFinish"
          type="date"
          value={actualFinish}
          onChange={(e) => setActualFinish(e.target.value)}
          required
          data-testid="actual-finish"
        />
      </label>
      {needsAdvance ? (
        <label data-testid="advance-data-date">
          <input
            type="checkbox"
            checked={advance}
            onChange={(e) => setAdvance(e.target.checked)}
          />{' '}
          Advance Data Date to {actualFinish}
          {advance ? (
            <input type="hidden" name="advanceDataDate" value={actualFinish} />
          ) : null}
        </label>
      ) : null}
      <button type="submit" disabled={pending || (needsAdvance && !advance)}>
        Mark complete
      </button>
      {refuse !== null ? (
        <p className="caption" role="alert" data-testid="complete-wp-refuse">
          {refuse}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteWpForm({
  projectId,
  wpId,
}: {
  readonly projectId: string;
  readonly wpId: string;
}) {
  const [pending, start] = useTransition();
  const [edges, setEdges] = useState<
    readonly { predecessorWpId: string; successorWpId: string }[] | null
  >(null);
  const [confirming, setConfirming] = useState(false);
  const [refuse, setRefuse] = useState<string | null>(null);

  return (
    <div className="caption" style={{ marginTop: 4 }} data-testid={`delete-wp-${wpId}`}>
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            start(async () => {
              const listed = await loadDeleteConfirmAction(projectId, wpId);
              setEdges(listed);
              setConfirming(true);
              setRefuse(null);
            });
          }}
          disabled={pending}
        >
          Delete…
        </button>
      ) : (
        <form
          action={(fd) => {
            start(async () => {
              setRefuse(null);
              const outcome = await deleteWorkPackageAction(fd);
              if (!outcome.ok) setRefuse(refuseMessage(outcome));
            });
          }}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="wpId" value={wpId} />
          {edges !== null && edges.length > 0 ? (
            <p data-testid="delete-edge-list">
              Edges that will be removed (not relinked):{' '}
              {edges.map((e) => `${e.predecessorWpId}→${e.successorWpId}`).join(', ')}
            </p>
          ) : (
            <p>No dependency edges.</p>
          )}
          <button type="submit" disabled={pending}>
            Confirm delete
          </button>{' '}
          <button type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          {refuse !== null ? (
            <p className="caption" role="alert" data-testid="delete-wp-refuse">
              {refuse}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

/** Derived-date cell: teaching refuse; focus moves to the constraint control. */
export function DerivedDateCell({
  constraintInputId,
  noProjectStart = false,
  noProjectStartLabel,
}: {
  readonly constraintInputId: string;
  readonly noProjectStart?: boolean;
  readonly noProjectStartLabel?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div data-testid="derived-date-cell">
      <input
        type="date"
        aria-label={
          noProjectStart && noProjectStartLabel
            ? noProjectStartLabel
            : 'Derived date (not editable)'
        }
        disabled={noProjectStart}
        onChange={async () => {
          const result = await refuseDerivedDateAction();
          setMessage(result.message);
          const el = document.getElementById(constraintInputId);
          el?.focus();
        }}
        data-testid="derived-date-input"
      />
      {message !== null ? (
        <p className="caption" role="status" data-testid="derived-date-teaching">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Plan strip action: *Set Project start* when the Project has none (2.11 / Q1→B). */
export function SetProjectStartForm({
  projectId,
  proposedStart,
}: {
  readonly projectId: string;
  readonly proposedStart: string;
}) {
  const [pending, start] = useTransition();
  const [refuse, setRefuse] = useState<string | null>(null);
  const [value, setValue] = useState(proposedStart);

  return (
    <form
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}
      data-testid="set-project-start"
      action={(fd) => {
        start(async () => {
          setRefuse(null);
          const outcome = await setProjectStartPlanAction(fd);
          if (!outcome.ok) setRefuse(refuseMessage(outcome));
        });
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <label>
        Set Project start{' '}
        <input
          type="date"
          name="projectStart"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={pending}>
        Set Project start
      </button>
      {refuse !== null ? (
        <p className="caption" role="alert">
          {refuse}
        </p>
      ) : null}
    </form>
  );
}
