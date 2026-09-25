'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  patchWpDurationAction,
  patchWpNameAction,
  patchWpRecordedPctAction,
  refuseDerivedDateAction,
  type PlanWriteOutcome,
} from '@/app/p/[projectId]/plan/actions';
import {
  CompleteWpForm,
  DeleteWpForm,
  SetProjectStartForm,
} from '@/components/plan-thin-edit';
import type { PlanGridRowView, PlanGridViewModel } from '@/components/plan-grid-types';
import {
  formatFloatDisplay,
  formatPlanDate,
  inkTone,
  readStoredPreset,
  recordedPctDisplay,
  SUMMARY_NA_LABEL,
  writeStoredPreset,
  type PlanPreset,
} from '@/lib/plan-grid-format';

function refuseMessage(outcome: Extract<PlanWriteOutcome, { ok: false }>): string {
  if (outcome.details !== undefined) {
    const parts = Object.entries(outcome.details).map(
      ([key, values]) => `${key}: ${values.join(', ')}`,
    );
    if (parts.length > 0) return parts.join('; ');
  }
  return outcome.messageKey;
}

function StateGlyph({ state }: { readonly state: string | null }) {
  const label =
    state === 'complete' ? 'complete' : state === 'in_progress' ? 'in progress' : 'remaining';
  const cls =
    state === 'complete'
      ? 'plan-state-g plan-state-done'
      : state === 'in_progress'
        ? 'plan-state-g plan-state-prog'
        : 'plan-state-g plan-state-rem';
  return <span className={cls} role="img" aria-label={label} />;
}

function SummaryDash() {
  return (
    <span className="plan-dash" aria-label={SUMMARY_NA_LABEL}>
      —
    </span>
  );
}

function DateCell({
  date,
  dataDate,
  notSchedulable,
  isSummary,
  onRefuseDerived,
}: {
  readonly date: string | null;
  readonly dataDate: string | null;
  readonly notSchedulable: boolean;
  readonly isSummary: boolean;
  readonly onRefuseDerived: () => void;
}) {
  if (isSummary) return <SummaryDash />;
  if (notSchedulable || date === null) {
    return (
      <span className="plan-dash" aria-label="not schedulable">
        —
      </span>
    );
  }
  const tone = inkTone(date, dataDate);
  return (
    <button
      type="button"
      className={`plan-date-btn ${tone === 'muted' ? 'plan-date-muted' : 'plan-date-full'}`}
      onClick={() => void onRefuseDerived()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void onRefuseDerived();
        }
      }}
    >
      {formatPlanDate(date)}
    </button>
  );
}

function InlineTextCell({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  readonly value: string;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly onCommit: (next: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === value) {
      setEditing(false);
      setError(null);
      return;
    }
    const refuse = await onCommit(trimmed);
    if (refuse) {
      setError(refuse);
      return;
    }
    setError(null);
    setEditing(false);
  };

  if (disabled) {
    return <span aria-label={ariaLabel}>{value}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="plan-inline-btn"
        aria-label={ariaLabel}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value}
        {error ? <span className="plan-cell-error"> {error}</span> : null}
      </button>
    );
  }

  return (
    <span>
      <input
        ref={inputRef}
        className="plan-inline-input"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value);
            setError(null);
            setEditing(false);
          } else if (e.key === 'Tab') {
            void commit();
          }
        }}
      />
      {error ? <span className="plan-cell-error">{error}</span> : null}
    </span>
  );
}

function InlineNumberCell({
  value,
  ariaLabel,
  suffix,
  emptyLabel,
  onCommit,
}: {
  readonly value: number | null;
  readonly ariaLabel: string;
  readonly suffix?: string;
  readonly emptyLabel?: string;
  readonly onCommit: (next: number | null) => Promise<string | null>;
}) {
  const display =
    value === null ? (emptyLabel ?? '—') : `${value}${suffix ?? ''}`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value === null ? '' : String(value));
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (!Number.isInteger(next) || (next as number) < 0)) {
      setError('invalid_input');
      return;
    }
    if (next === value) {
      setEditing(false);
      setError(null);
      return;
    }
    const refuse = await onCommit(next);
    if (refuse) {
      setError(refuse);
      return;
    }
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="plan-inline-btn num"
        aria-label={ariaLabel}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {display}
        {error ? <span className="plan-cell-error"> {error}</span> : null}
      </button>
    );
  }

  return (
    <span>
      <input
        ref={inputRef}
        className="plan-inline-input num"
        aria-label={ariaLabel}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value === null ? '' : String(value));
            setError(null);
            setEditing(false);
          } else if (e.key === 'Tab') {
            void commit();
          }
        }}
      />
      {error ? <span className="plan-cell-error">{error}</span> : null}
    </span>
  );
}

function ExceptionCell({ row }: { readonly row: PlanGridRowView }) {
  if (!row.isLeaf) return <SummaryDash />;
  if (!row.exceptionLabel) return null;
  const cls =
    row.exceptionKind === 'violation'
      ? row.isMilestone
        ? 'plan-ex plan-ex-m'
        : 'plan-ex plan-ex-v'
      : row.exceptionKind === 'out_of_sequence'
        ? 'plan-ex plan-ex-o'
        : 'plan-ex plan-ex-n';
  return <span className={cls}>{row.exceptionLabel}</span>;
}

export function PlanTreeGrid({
  model,
  proposedFinish,
}: {
  readonly model: PlanGridViewModel;
  readonly proposedFinish: string;
}) {
  const gridId = useId();
  const [preset, setPreset] = useState<PlanPreset>('schedule');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const initial = new Set<string>();
    for (const row of model.rows) {
      if (row.hasChildren) initial.add(row.wpId);
    }
    return initial;
  });
  const [focusedWpId, setFocusedWpId] = useState<string | null>(
    model.rows[0]?.wpId ?? null,
  );
  const [teaching, setTeaching] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const focusRestore = useRef<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    setPreset(readStoredPreset(model.userId, model.projectId));
  }, [model.userId, model.projectId]);

  useEffect(() => {
    if (focusRestore.current === null) return;
    const id = focusRestore.current;
    focusRestore.current = null;
    const el = tableRef.current?.querySelector(`[data-wp-id="${id}"]`) as HTMLElement | null;
    el?.focus();
  }, [preset]);

  const visibleRows = useMemo(() => {
    const hidden = new Set<string>();
    const parentCollapsed = (parentId: string | null): boolean => {
      if (parentId === null) return false;
      if (!expanded.has(parentId)) return true;
      const parent = model.rows.find((r) => r.wpId === parentId);
      return parent ? parentCollapsed(parent.parentId) : false;
    };
    for (const row of model.rows) {
      if (parentCollapsed(row.parentId)) hidden.add(row.wpId);
    }
    return model.rows.filter((r) => !hidden.has(r.wpId));
  }, [model.rows, expanded]);

  const setPresetKeepFocus = useCallback(
    (next: PlanPreset) => {
      focusRestore.current = focusedWpId;
      setPreset(next);
      writeStoredPreset(model.userId, model.projectId, next);
    },
    [focusedWpId, model.userId, model.projectId],
  );

  const toggleExpand = (wpId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(wpId)) next.delete(wpId);
      else next.add(wpId);
      return next;
    });
  };

  const refuseDerived = async (constraintInputId: string) => {
    const result = await refuseDerivedDateAction();
    setTeaching(result.message);
    const el = document.getElementById(constraintInputId);
    el?.focus();
  };

  const patchName = (wpId: string, name: string) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const outcome = await patchWpNameAction({
          projectId: model.projectId,
          wpId,
          name,
        });
        resolve(outcome.ok ? null : refuseMessage(outcome));
      });
    });

  const patchDuration = (wpId: string, durationDays: number | null) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const outcome = await patchWpDurationAction({
          projectId: model.projectId,
          wpId,
          durationDays,
        });
        resolve(outcome.ok ? null : refuseMessage(outcome));
      });
    });

  const patchRecordedPct = (wpId: string, pct: number | null) =>
    new Promise<string | null>((resolve) => {
      startTransition(async () => {
        if (pct === null) {
          resolve('invalid_input');
          return;
        }
        const outcome = await patchWpRecordedPctAction({
          projectId: model.projectId,
          wpId,
          percent: pct,
        });
        resolve(outcome.ok ? null : refuseMessage(outcome));
      });
    });

  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (e.key === '1') {
      e.preventDefault();
      setPresetKeepFocus('schedule');
      return;
    }
    if (e.key === '2') {
      e.preventDefault();
      setPresetKeepFocus('progress');
      return;
    }
    // 3 / 4 reserved for Baseline / All — no-op (Q4→A).
    if (e.key === '3' || e.key === '4') {
      e.preventDefault();
      return;
    }
    if (!focusedWpId) return;
    const idx = visibleRows.findIndex((r) => r.wpId === focusedWpId);
    if (e.key === 'ArrowDown' && idx < visibleRows.length - 1) {
      e.preventDefault();
      setFocusedWpId(visibleRows[idx + 1]!.wpId);
    } else if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      setFocusedWpId(visibleRows[idx - 1]!.wpId);
    } else if (e.key === 'ArrowRight') {
      const row = visibleRows[idx];
      if (row?.hasChildren && !expanded.has(row.wpId)) {
        e.preventDefault();
        toggleExpand(row.wpId);
      }
    } else if (e.key === 'ArrowLeft') {
      const row = visibleRows[idx];
      if (row?.hasChildren && expanded.has(row.wpId)) {
        e.preventDefault();
        toggleExpand(row.wpId);
      }
    }
  };

  const renderScheduleCells = (row: PlanGridRowView): ReactNode => {
    const constraintId = `constraint-${row.wpId}`;
    const float = formatFloatDisplay(row.floatDays, row.notSchedulable);
    const pctLabel = row.isLeaf
      ? recordedPctDisplay(row.recordedPct)
      : null;
    return (
      <>
        <td>
          <DateCell
            date={row.earlyStart}
            dataDate={model.dataDate}
            notSchedulable={row.notSchedulable}
            isSummary={!row.isLeaf}
            onRefuseDerived={() => void refuseDerived(constraintId)}
          />
        </td>
        <td>
          <DateCell
            date={row.earlyFinish}
            dataDate={model.dataDate}
            notSchedulable={row.notSchedulable}
            isSummary={!row.isLeaf}
            onRefuseDerived={() => void refuseDerived(constraintId)}
          />
        </td>
        <td className="num">
          {row.isLeaf ? (
            <InlineNumberCell
              value={row.durationDays}
              ariaLabel={`Duration for ${row.name}`}
              suffix="d"
              emptyLabel="—"
              onCommit={(next) => patchDuration(row.wpId, next)}
            />
          ) : (
            <SummaryDash />
          )}
        </td>
        <td>
          {row.isLeaf ? (
            <span className="plan-pred">{row.predecessorsText || '—'}</span>
          ) : (
            <SummaryDash />
          )}
        </td>
        <td>
          {row.isLeaf ? (
            <input
              id={constraintId}
              type="text"
              readOnly
              className="plan-constraint"
              value={row.constraintLabel}
              aria-label={`Constraint for ${row.name}`}
              data-testid={`constraint-${row.wpId}`}
            />
          ) : (
            <SummaryDash />
          )}
        </td>
        <td className={`num ${float.negative ? 'plan-float-neg' : ''}`}>
          {row.isLeaf ? (
            row.notSchedulable || row.floatDays === null ? (
              <span className="plan-dash">—</span>
            ) : (
              <>
                {float.text}
                <span className="plan-u">d</span>
              </>
            )
          ) : (
            <SummaryDash />
          )}
        </td>
        <td>
          {row.isLeaf ? (
            row.notSchedulable || !row.isCritical ? (
              <span className="plan-dash">—</span>
            ) : (
              <span className="plan-crit-label">
                <span className="plan-critbar" aria-hidden="true" />
                Critical
              </span>
            )
          ) : (
            <SummaryDash />
          )}
        </td>
        <td>
          <ExceptionCell row={row} />
        </td>
        <td className="num">
          {row.isLeaf ? (
            <InlineNumberCell
              value={
                row.recordedPct
                  ? Math.round(
                      Number(
                        (BigInt(row.recordedPct.num) * 1000n) / BigInt(row.recordedPct.den),
                      ) / 10,
                    )
                  : null
              }
              ariaLabel={`Recorded percent for ${row.name}`}
              suffix="%"
              emptyLabel={pctLabel ?? 'none — scheduled as 0%'}
              onCommit={(next) => patchRecordedPct(row.wpId, next)}
            />
          ) : (
            <SummaryDash />
          )}
        </td>
      </>
    );
  };

  const renderProgressCells = (row: PlanGridRowView): ReactNode => (
    <>
      <td>
        {row.isLeaf ? (
          row.actualStart ? (
            formatPlanDate(row.actualStart)
          ) : (
            <span className="plan-dash">—</span>
          )
        ) : (
          <SummaryDash />
        )}
      </td>
      <td>
        {row.isLeaf ? (
          row.actualFinish ? (
            formatPlanDate(row.actualFinish)
          ) : (
            <span className="plan-dash">—</span>
          )
        ) : (
          <SummaryDash />
        )}
      </td>
      <td className="num">
        {row.isLeaf ? (
          <InlineNumberCell
            value={
              row.recordedPct
                ? Math.round(
                    Number(
                      (BigInt(row.recordedPct.num) * 1000n) / BigInt(row.recordedPct.den),
                    ) / 10,
                  )
                : null
            }
            ariaLabel={`Recorded percent for ${row.name}`}
            suffix="%"
            emptyLabel="none — scheduled as 0%"
            onCommit={(next) => patchRecordedPct(row.wpId, next)}
          />
        ) : (
          <SummaryDash />
        )}
      </td>
      <td className="num">
        {row.isLeaf ? (
          row.remainingDays === null ? (
            <span className="plan-dash">—</span>
          ) : (
            <>
              {row.remainingDays}
              <span className="plan-u">d</span>
            </>
          )
        ) : (
          <SummaryDash />
        )}
      </td>
    </>
  );

  return (
    <div className="plan-surface" data-testid="plan-surface" data-pending={pending ? '1' : '0'}>
      {/* Q1→A: structural slots only — behaviour in 2.15 / 2.16 */}
      <div className="plan-schedule-strip-slot" data-testid="schedule-strip-slot" aria-hidden="true" />

      <div className="plan-toolbar" data-testid="plan-toolbar">
        <div className="plan-seg" role="group" aria-label="Column preset">
          <button
            type="button"
            aria-pressed={preset === 'schedule'}
            onClick={() => setPresetKeepFocus('schedule')}
          >
            Schedule
          </button>
          <button
            type="button"
            aria-pressed={preset === 'progress'}
            onClick={() => setPresetKeepFocus('progress')}
          >
            Progress
          </button>
          <button type="button" aria-pressed={false} disabled title="Later epic">
            Baseline compare
          </button>
          <button type="button" aria-pressed={false} disabled title="Later epic">
            All
          </button>
        </div>
        {teaching ? (
          <span className="plan-teaching" role="status" data-testid="derived-date-teaching">
            {teaching}
          </span>
        ) : null}
      </div>

      <div className="plan-what-moved-slot" data-testid="what-moved-slot" aria-hidden="true" />

      {model.noProjectStart ? (
        <div className="report-sub" style={{ margin: '8px 12px' }} data-testid="no-project-start-yet">
          <span aria-label="no project start yet">no project start yet</span>
          <SetProjectStartForm projectId={model.projectId} proposedStart={proposedFinish} />
        </div>
      ) : null}

      {model.scheduleStale ? (
        <p className="caption" style={{ margin: '4px 12px' }} data-testid="schedule-stale">
          {model.haltedReason
            ? `Schedule halted: ${model.haltedReason}. Derived dates are stale.`
            : 'Schedule outputs are stale — acknowledge the latest run.'}
        </p>
      ) : null}

      <div className="plan-body">
        <div className="plan-gridwrap">
          <table
            ref={tableRef}
            id={gridId}
            role="treegrid"
            aria-label="Work packages"
            className="plan-treegrid"
            data-testid="plan-tree"
            data-preset={preset}
            onKeyDown={onGridKeyDown}
          >
            <colgroup>
              <col style={{ width: 82 }} />
              <col style={{ width: 214 }} />
              <col style={{ width: 34 }} />
              {preset === 'schedule' ? (
                <>
                  <col style={{ width: 103 }} />
                  <col style={{ width: 103 }} />
                  <col style={{ width: 48 }} />
                  <col style={{ width: 117 }} />
                  <col style={{ width: 180 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 88 }} />
                </>
              ) : (
                <>
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 100 }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr>
                <th className="plan-fz1">WBS</th>
                <th className="plan-fz2">Name</th>
                <th className="plan-fz3">
                  <span className="label" aria-label="State">
                    St
                  </span>
                </th>
                {preset === 'schedule' ? (
                  <>
                    <th>
                      Start
                      <span className="plan-anch">derived</span>
                    </th>
                    <th>
                      Finish
                      <span className="plan-anch">derived</span>
                    </th>
                    <th className="num">Dur</th>
                    <th>Predecessors</th>
                    <th>Constraint</th>
                    <th className="num">
                      Float
                      {model.floatAnchorLabel ? (
                        <span className="plan-anch">{model.floatAnchorLabel}</span>
                      ) : null}
                    </th>
                    <th>Critical</th>
                    <th>Exception</th>
                    <th className="num">Recorded %</th>
                  </>
                ) : (
                  <>
                    <th>Actual start</th>
                    <th>Actual finish</th>
                    <th className="num">Recorded %</th>
                    <th className="num">Remaining</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const focused = row.wpId === focusedWpId;
                const expandedRow = row.hasChildren ? expanded.has(row.wpId) : undefined;
                return (
                  <tr
                    key={row.wpId}
                    role="row"
                    tabIndex={focused ? 0 : -1}
                    data-wp-id={row.wpId}
                    data-testid={`wp-${row.wbsCode}`}
                    aria-level={row.level}
                    aria-posinset={row.posInSet}
                    aria-setsize={row.setSize}
                    {...(row.hasChildren
                      ? { 'aria-expanded': expandedRow ? true : false }
                      : {})}
                    className={[
                      focused ? 'plan-row-sel' : '',
                      row.isCritical && row.isLeaf && !row.notSchedulable ? 'plan-row-crit' : '',
                      !row.isLeaf ? 'plan-row-summary' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onFocus={() => setFocusedWpId(row.wpId)}
                    onClick={() => setFocusedWpId(row.wpId)}
                  >
                    <td className={`plan-fz1 ${!row.isLeaf ? 'plan-lvl1' : ''}`}>{row.wbsCode}</td>
                    <td
                      className={`plan-fz2 ${!row.isLeaf ? 'plan-lvl1' : ''}`}
                      style={{ paddingLeft: 8 + (row.level - 1) * 16 }}
                    >
                      {row.hasChildren ? (
                        <button
                          type="button"
                          className="plan-tw"
                          aria-label={expandedRow ? 'Collapse' : 'Expand'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(row.wpId);
                          }}
                        >
                          {expandedRow ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span className="plan-tw" aria-hidden="true" />
                      )}
                      <InlineTextCell
                        value={row.name}
                        ariaLabel={`Name for ${row.wbsCode}`}
                        onCommit={(next) => patchName(row.wpId, next)}
                      />
                      {row.isCatchAll ? <span className="tag">Catch-all</span> : null}
                      {row.isMilestone ? <span className="tag">Milestone</span> : null}
                    </td>
                    <td className="plan-fz3">
                      <StateGlyph state={row.state} />
                    </td>
                    {preset === 'schedule'
                      ? renderScheduleCells(row)
                      : renderProgressCells(row)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside
          className="plan-exceptions-rail-slot"
          data-testid="exceptions-rail-slot"
          aria-hidden="true"
        />
      </div>

      <div className="plan-thin-actions caption" style={{ margin: '12px' }}>
        {visibleRows
          .filter((r) => r.isLeaf && r.wpId === focusedWpId)
          .map((r) => (
            <div key={r.wpId} data-testid={`thin-actions-${r.wpId}`}>
              <CompleteWpForm
                projectId={model.projectId}
                wpId={r.wpId}
                dataDate={model.dataDate}
                proposedFinish={proposedFinish}
              />
              <DeleteWpForm projectId={model.projectId} wpId={r.wpId} />
            </div>
          ))}
      </div>
    </div>
  );
}
