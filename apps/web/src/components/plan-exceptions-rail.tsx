'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  ExceptionsRailItemKey,
  PlanExceptionsRailNotSchedulableView,
  PlanExceptionsRailOosView,
  PlanExceptionsRailView,
  PlanExceptionsRailViolationView,
} from '@/components/plan-grid-types';
import {
  EMPTY_CHAIN_COPY,
  EXCEPTIONS_RAIL_BREAKPOINT_PX,
  NOT_SCHEDULABLE_COPY,
  VIOLATION_HONESTY_LINE,
  firstPresentChainIndex,
  groupIdForRailKey,
  notSchedulableItemKey,
  oosExplainerProse,
  oosItemKey,
  type ExplainerTarget,
  violationItemKey,
} from '@/lib/plan-exceptions';
import { formatPlanDate } from '@/lib/plan-strip-what-moved';
import { PLAN_GRID_SLOTS } from '@/lib/plan-grid-view';

export interface PlanExceptionsRailProps {
  readonly rail: PlanExceptionsRailView;
  readonly pinned: boolean;
  readonly drawerOpen: boolean;
  readonly selectedKey: ExceptionsRailItemKey | null;
  readonly explainer: ExplainerTarget | null;
  readonly onSelectKey: (key: ExceptionsRailItemKey | null) => void;
  readonly onCloseExplainer: () => void;
  readonly onActivateItem: (key: ExceptionsRailItemKey) => void;
  readonly onFocusWp: (wpId: string) => void;
  readonly onPatchDuration: (wpId: string, durationDays: number | null) => Promise<string | null>;
  /** True while the Comfort chain list owns Arrow keys. */
  readonly chainFocusActive: boolean;
  readonly onChainFocusActiveChange: (active: boolean) => void;
}

/**
 * Schedule-exceptions rail (UX-DR8) — three groups, empty copy, pinned or drawer chrome.
 * Explainers are non-modal popovers (UX-DR9 / UX-DR24).
 */
export function PlanExceptionsRail({
  rail,
  pinned,
  drawerOpen,
  selectedKey,
  explainer,
  onSelectKey,
  onCloseExplainer,
  onActivateItem,
  onFocusWp,
  onPatchDuration,
  chainFocusActive,
  onChainFocusActiveChange,
}: PlanExceptionsRailProps) {
  const visible = pinned || drawerOpen;
  const [violationsOpen, setViolationsOpen] = useState(rail.violations.length > 0);
  const [oosOpen, setOosOpen] = useState(rail.outOfSequence.length > 0);
  const [nsOpen, setNsOpen] = useState(rail.notSchedulable.length > 0);

  useEffect(() => {
    setViolationsOpen(rail.violations.length > 0);
    setOosOpen(rail.outOfSequence.length > 0);
    setNsOpen(rail.notSchedulable.length > 0);
  }, [rail.violations.length, rail.outOfSequence.length, rail.notSchedulable.length]);

  // j/k into a collapsed non-empty group expands it.
  useEffect(() => {
    if (!selectedKey) return;
    const group = groupIdForRailKey(selectedKey);
    if (group === 'violations' && rail.violations.length > 0) setViolationsOpen(true);
    else if (group === 'oos' && rail.outOfSequence.length > 0) setOosOpen(true);
    else if (group === 'not_schedulable' && rail.notSchedulable.length > 0) setNsOpen(true);
  }, [selectedKey, rail.violations.length, rail.outOfSequence.length, rail.notSchedulable.length]);

  if (!visible) {
    return (
      <aside
        className="plan-exceptions-rail-slot plan-exceptions-rail-slot--hidden"
        data-testid={PLAN_GRID_SLOTS[4]}
        data-pinned={pinned ? '1' : '0'}
        data-drawer-open="0"
        aria-hidden="true"
      />
    );
  }

  return (
    <aside
      className={[
        'plan-exceptions-rail-slot',
        pinned ? 'plan-exceptions-rail-slot--pinned' : 'plan-exceptions-rail-slot--drawer',
      ].join(' ')}
      data-testid={PLAN_GRID_SLOTS[4]}
      data-pinned={pinned ? '1' : '0'}
      data-drawer-open={drawerOpen ? '1' : '0'}
      aria-label="Schedule exceptions"
    >
      <div className="plan-ex-rail">
        <h2 className="plan-ex-rail-title">
          Schedule exceptions
          {rail.totalCount > 0 ? ` · ${rail.totalCount}` : ''}
        </h2>

        {rail.totalCount === 0 ? (
          <p className="plan-ex-rail-empty" data-testid="exceptions-rail-empty">
            No schedule exceptions
          </p>
        ) : (
          <>
            <RailGroup
              title="Constraint violations"
              count={rail.violations.length}
              open={violationsOpen}
              onToggle={() => setViolationsOpen((v) => !v)}
              testId="exceptions-group-violations"
            >
              {rail.violations.map((v) => {
                const key = violationItemKey(v.wpId);
                return (
                  <RailItem
                    key={key}
                    itemKey={key}
                    selected={selectedKey === key}
                    label={v.label}
                    labelClass={v.isMilestone ? 'plan-ex plan-ex-m' : 'plan-ex plan-ex-v'}
                    line2={`${v.wbsCode} ${v.name}`}
                    line3={
                      v.isMilestone
                        ? `Milestone · asked ${formatPlanDate(v.askedDate)}, derived ${formatPlanDate(v.derivedDate)}`
                        : `Asked ${formatPlanDate(v.askedDate)}, derived ${formatPlanDate(v.derivedDate)}`
                    }
                    onSelect={() => onSelectKey(key)}
                    onActivate={() => onActivateItem(key)}
                  />
                );
              })}
            </RailGroup>

            <RailGroup
              title="Out-of-sequence links"
              count={rail.outOfSequence.length}
              open={oosOpen}
              onToggle={() => setOosOpen((v) => !v)}
              testId="exceptions-group-oos"
            >
              {rail.outOfSequence.map((e) => {
                const key = oosItemKey(e.predecessorWpId, e.successorWpId);
                return (
                  <RailItem
                    key={key}
                    itemKey={key}
                    selected={selectedKey === key}
                    label={e.label}
                    labelClass="plan-ex plan-ex-o"
                    line2={`${e.successorWbsCode} ${e.successorName}`}
                    line3={
                      e.successorActualStart && e.predecessorFinish
                        ? `Started ${formatPlanDate(e.successorActualStart)}, before ${e.predecessorWbsCode} finishes ${formatPlanDate(e.predecessorFinish)}`
                        : `Out of sequence with ${e.predecessorWbsCode}`
                    }
                    onSelect={() => onSelectKey(key)}
                    onActivate={() => onActivateItem(key)}
                  />
                );
              })}
            </RailGroup>

            <RailGroup
              title="Not schedulable yet"
              count={rail.notSchedulable.length}
              open={nsOpen}
              onToggle={() => setNsOpen((v) => !v)}
              testId="exceptions-group-ns"
            >
              {rail.notSchedulable.map((n) => {
                const key = notSchedulableItemKey(n.wpId);
                return (
                  <RailItem
                    key={key}
                    itemKey={key}
                    selected={selectedKey === key}
                    label={n.label}
                    labelClass="plan-ex plan-ex-n"
                    line2={`${n.wbsCode} ${n.name}`}
                    line3="Excluded from both passes · blocks the next Baseline"
                    onSelect={() => onSelectKey(key)}
                    onActivate={() => onActivateItem(key)}
                  />
                );
              })}
            </RailGroup>
          </>
        )}
      </div>

      {explainer ? (
        <ExceptionExplainer
          target={explainer}
          rail={rail}
          onClose={onCloseExplainer}
          onFocusWp={onFocusWp}
          onPatchDuration={onPatchDuration}
          chainFocusActive={chainFocusActive}
          onChainFocusActiveChange={onChainFocusActiveChange}
        />
      ) : null}
    </aside>
  );
}

function RailGroup({
  title,
  count,
  open,
  onToggle,
  testId,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="plan-ex-rail-group" data-testid={testId} data-count={count}>
      <button
        type="button"
        className="plan-ex-rail-grp"
        aria-expanded={open}
        onClick={onToggle}
        disabled={count === 0}
      >
        {title} · {count}
      </button>
      {open && count > 0 ? <div className="plan-ex-rail-items">{children}</div> : null}
    </div>
  );
}

function RailItem({
  itemKey,
  selected,
  label,
  labelClass,
  line2,
  line3,
  onSelect,
  onActivate,
}: {
  readonly itemKey: ExceptionsRailItemKey;
  readonly selected: boolean;
  readonly label: string;
  readonly labelClass: string;
  readonly line2: string;
  readonly line3: string;
  readonly onSelect: () => void;
  readonly onActivate: () => void;
}) {
  return (
    <button
      type="button"
      className={['plan-ex-rail-item', selected ? 'plan-ex-rail-item--on' : '']
        .filter(Boolean)
        .join(' ')}
      data-rail-key={itemKey}
      data-testid={`exceptions-item-${itemKey}`}
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        onSelect();
        onActivate();
      }}
      onFocus={onSelect}
    >
      <div className={`plan-ex-rail-l1 ${labelClass}`}>{label}</div>
      <div className="plan-ex-rail-l2">{line2}</div>
      <div className="plan-ex-rail-l3">{line3}</div>
    </button>
  );
}

function ExceptionExplainer({
  target,
  rail,
  onClose,
  onFocusWp,
  onPatchDuration,
  chainFocusActive,
  onChainFocusActiveChange,
}: {
  readonly target: ExplainerTarget;
  readonly rail: PlanExceptionsRailView;
  readonly onClose: () => void;
  readonly onFocusWp: (wpId: string) => void;
  readonly onPatchDuration: (wpId: string, durationDays: number | null) => Promise<string | null>;
  readonly chainFocusActive: boolean;
  readonly onChainFocusActiveChange: (active: boolean) => void;
}) {
  const titleId = useId();
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onChainFocusActiveChange(false);
        onClose();
      }
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [onClose, onChainFocusActiveChange]);

  const violationRow =
    target.kind === 'violation'
      ? (rail.violations.find((v) => v.wpId === target.wpId) ?? null)
      : null;
  // Q2→B: when a chain exists, the list owns Arrow keys — focus it, not the dialog shell.
  const chainOwnsFocus = violationRow !== null && violationRow.chain.length > 0;

  useEffect(() => {
    if (chainOwnsFocus) return;
    popRef.current?.focus();
  }, [target, chainOwnsFocus]);

  let body: ReactNode = null;
  let title = '';
  if (target.kind === 'violation') {
    if (!violationRow) return null;
    title = `${violationRow.wbsCode} ${violationRow.name} — constraint violation`;
    body = (
      <ViolationExplainerBody
        row={violationRow}
        titleId={titleId}
        calendarVersionSeq={rail.holidayCalendarVersionSeq}
        onFocusWp={onFocusWp}
        chainFocusActive={chainFocusActive}
        onChainFocusActiveChange={onChainFocusActiveChange}
        autoFocusChain
      />
    );
  } else if (target.kind === 'out_of_sequence') {
    const row = rail.outOfSequence.find(
      (e) =>
        e.predecessorWpId === target.predecessorWpId &&
        e.successorWpId === target.successorWpId,
    );
    if (!row) return null;
    title = `${row.successorWbsCode} ${row.successorName} — out of sequence`;
    body = <OosExplainerBody row={row} titleId={titleId} />;
  } else {
    const row = rail.notSchedulable.find((n) => n.wpId === target.wpId);
    if (!row) return null;
    title = `${row.wbsCode} ${row.name} — not schedulable yet`;
    body = (
      <NotSchedulableExplainerBody
        row={row}
        titleId={titleId}
        onPatchDuration={onPatchDuration}
      />
    );
  }

  return (
    <div
      ref={popRef}
      className="plan-ex-pop"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-label={title}
      tabIndex={-1}
      data-testid="exception-explainer"
      data-kind={target.kind}
    >
      {body}
      <button type="button" className="plan-ex-pop-close caption" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function ViolationExplainerBody({
  row,
  titleId,
  calendarVersionSeq,
  onFocusWp,
  chainFocusActive,
  onChainFocusActiveChange,
  autoFocusChain = false,
}: {
  readonly row: PlanExceptionsRailViolationView;
  readonly titleId: string;
  readonly calendarVersionSeq: number | null;
  readonly onFocusWp: (wpId: string) => void;
  readonly chainFocusActive: boolean;
  readonly onChainFocusActiveChange: (active: boolean) => void;
  readonly autoFocusChain?: boolean;
}) {
  // Display root-cause first (reverse of engine immediate-driver-first order).
  const displayChain = [...row.chain].reverse();
  const [chainIdx, setChainIdx] = useState(() => firstPresentChainIndex(displayChain));
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setChainIdx(firstPresentChainIndex([...row.chain].reverse()));
  }, [row.wpId, row.chain]);

  useEffect(() => {
    if (!autoFocusChain || displayChain.length === 0) return;
    onChainFocusActiveChange(true);
    listRef.current?.focus();
  }, [autoFocusChain, row.wpId, displayChain.length, onChainFocusActiveChange]);

  const revealChainWp = (wpId: string) => {
    onChainFocusActiveChange(true);
    onFocusWp(wpId);
    // Keep keyboard on the chain list (onFocusWp must not steal DOM focus).
    listRef.current?.focus();
  };

  const onChainKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (displayChain.length === 0) return;
    if (e.key === 'Enter') {
      const entry = displayChain[chainIdx];
      if (!entry?.presentInLiveTree) return;
      e.preventDefault();
      e.stopPropagation();
      revealChainWp(entry.wpId);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    e.stopPropagation();
    onChainFocusActiveChange(true);
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    let next = chainIdx;
    for (let step = 0; step < displayChain.length; step += 1) {
      next = (next + delta + displayChain.length) % displayChain.length;
      const entry = displayChain[next]!;
      if (entry.presentInLiveTree) {
        setChainIdx(next);
        revealChainWp(entry.wpId);
        return;
      }
    }
  };

  const constraintWord =
    row.constraintType === 'must_finish_on' ? 'Must finish on' : 'Must start on';

  return (
    <>
      <h3 id={titleId} className="plan-ex-pop-title">
        {row.wbsCode} {row.name} — constraint violation
      </h3>
      <p className="caption" style={{ margin: '2px 0 0' }}>
        {constraintWord}.{row.isMilestone ? ' Milestone.' : ''}
      </p>
      <dl className="plan-ex-pop-kv">
        <dt>Date asked for</dt>
        <dd>{formatPlanDate(row.askedDate)}</dd>
        <dt>Date derived</dt>
        <dd>{formatPlanDate(row.derivedDate)}</dd>
        <dt>Late by</dt>
        <dd>
          {row.daysLate} working day{row.daysLate === 1 ? '' : 's'}
        </dd>
        <dt>Counted on</dt>
        <dd>
          {calendarVersionSeq !== null
            ? `Holiday Calendar version ${calendarVersionSeq}`
            : 'Holiday Calendar version unavailable'}
        </dd>
      </dl>
      <div className="plan-ex-pop-chain">
        <span className="label">Chain that forced it</span>
        {displayChain.length === 0 ? (
          <p className="caption" data-testid="empty-chain">
            {EMPTY_CHAIN_COPY}
          </p>
        ) : (
          <ul
            ref={listRef}
            tabIndex={0}
            role="listbox"
            aria-label="Driving predecessor chain"
            data-testid="violation-chain"
            data-chain-focus={chainFocusActive ? '1' : '0'}
            onFocus={() => onChainFocusActiveChange(true)}
            onBlur={(e) => {
              // Only clear when focus leaves the list (not when we briefly re-focus ourselves).
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                onChainFocusActiveChange(false);
              }
            }}
            onKeyDown={onChainKeyDown}
          >
            {displayChain.map((c, i) => (
              <li
                key={c.wpId}
                role="option"
                aria-selected={i === chainIdx}
                className={i === chainIdx ? 'plan-ex-pop-chain-f' : undefined}
                data-present={c.presentInLiveTree ? '1' : '0'}
                onClick={() => {
                  if (!c.presentInLiveTree) return;
                  setChainIdx(i);
                  revealChainWp(c.wpId);
                }}
              >
                <span className="plan-ex-pop-chain-w">
                  {c.wbsCode} {c.name}
                </span>
                <span className="plan-ex-pop-chain-d">
                  {c.finish ? formatPlanDate(c.finish) : '—'}
                </span>
                <span className="plan-ex-pop-chain-u">
                  {c.lagDays === null
                    ? '—'
                    : c.lagDays === 0
                      ? '—'
                      : `${c.lagDays > 0 ? '+' : ''}${c.lagDays}d lag`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="plan-ex-pop-foot" data-testid="violation-honesty">
        {VIOLATION_HONESTY_LINE}
      </p>
    </>
  );
}

function OosExplainerBody({
  row,
  titleId,
}: {
  readonly row: PlanExceptionsRailOosView;
  readonly titleId: string;
}) {
  const prose = oosExplainerProse({
    successorWbsCode: row.successorWbsCode,
    successorName: row.successorName,
    predecessorWbsCode: row.predecessorWbsCode,
    predecessorName: row.predecessorName,
    successorActualStart: row.successorActualStart,
    predecessorFinish: row.predecessorFinish,
    formatDate: formatPlanDate,
  });
  return (
    <>
      <h3 id={titleId} className="plan-ex-pop-title">
        {row.successorWbsCode} {row.successorName} — out of sequence
      </h3>
      <p className="plan-ex-pop-prose plan-ex-pop-prose--neutral" data-testid="oos-explainer-prose">
        {prose}
      </p>
      <p className="caption">No fix — actual dates are kept as recorded.</p>
    </>
  );
}

function NotSchedulableExplainerBody({
  row,
  titleId,
  onPatchDuration,
}: {
  readonly row: PlanExceptionsRailNotSchedulableView;
  readonly titleId: string;
  readonly onPatchDuration: (wpId: string, durationDays: number | null) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      setError('invalid_input');
      return;
    }
    const next = Number(trimmed);
    if (!Number.isInteger(next) || next < 0) {
      setError('invalid_input');
      return;
    }
    setPending(true);
    try {
      const refuse = await onPatchDuration(row.wpId, next);
      if (refuse) {
        setError(refuse);
        return;
      }
      setError(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <h3 id={titleId} className="plan-ex-pop-title">
        {row.wbsCode} {row.name} — not schedulable yet
      </h3>
      <p className="plan-ex-pop-prose" data-testid="ns-explainer-copy">
        {NOT_SCHEDULABLE_COPY}
      </p>
      <label className="label" htmlFor={`ns-dur-${row.wpId}`}>
        Duration (working days)
      </label>
      <div className="plan-ex-pop-dur">
        <input
          id={`ns-dur-${row.wpId}`}
          className="plan-inline-input num"
          inputMode="numeric"
          value={draft}
          disabled={pending}
          data-testid="ns-duration-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
        />
        <button
          type="button"
          className="btn primary"
          disabled={pending}
          onClick={() => void commit()}
        >
          Set duration
        </button>
      </div>
      {error ? <span className="plan-cell-error">{error}</span> : null}
    </>
  );
}

/** Toolbar toggle — always shows total count (UX-DR8 / UX-DR27). */
export function ExceptionsRailToggle({
  totalCount,
  pinned,
  drawerOpen,
  onToggle,
}: {
  readonly totalCount: number;
  readonly pinned: boolean;
  readonly drawerOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'plan-ex-toggle',
        pinned ? 'plan-ex-toggle--pinned' : '',
        !pinned && drawerOpen ? 'plan-ex-toggle--open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="exceptions-rail-toggle"
      aria-pressed={!pinned && drawerOpen}
      aria-label={`Schedule exceptions, ${totalCount}`}
      title={
        pinned
          ? `Schedule exceptions · ${totalCount}`
          : drawerOpen
            ? 'Close exceptions drawer'
            : 'Open exceptions drawer'
      }
      onClick={() => {
        if (!pinned) onToggle();
      }}
    >
      Exceptions · {totalCount}
      {!pinned ? <span aria-hidden="true"> {drawerOpen ? '▾' : '▸'}</span> : null}
    </button>
  );
}

export function useExceptionsPinned(): boolean {
  const [pinned, setPinned] = useState(() =>
    typeof window !== 'undefined'
      ? window.innerWidth >= EXCEPTIONS_RAIL_BREAKPOINT_PX
      : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${EXCEPTIONS_RAIL_BREAKPOINT_PX}px)`);
    const apply = () => setPinned(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return pinned;
}
