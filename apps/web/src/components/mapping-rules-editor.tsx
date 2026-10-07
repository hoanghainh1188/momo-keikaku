'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';

import {
  previewMappingRule,
  removeMappingRule,
  reorderMappingRuleList,
  saveMappingRule,
  type RuleActionResult,
  type RulePreviewResult,
} from '@/app/actions';

type LeafWp = { readonly id: string; readonly label: string };

const FIELDS = ['milestone', 'category', 'issueType', 'parent', 'keyPattern'] as const;
type Field = (typeof FIELDS)[number];

type RuleRow = {
  readonly id: string;
  readonly priority: number;
  readonly name: string;
  readonly match: { readonly field: string; readonly value: string };
  readonly displayValue: string;
  readonly wpId: string;
  readonly wpLabel: string;
  readonly currentlyMapped: number;
};

type Draft = {
  readonly name: string;
  readonly priority: string;
  readonly matchField: Field;
  readonly matchValue: string;
  readonly wpId: string;
};

type Mode =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly ruleId: string }
  | { readonly kind: 'delete'; readonly ruleId: string };

type PreviewState =
  | { readonly status: 'loading'; readonly key: string }
  | { readonly status: 'ready'; readonly key: string; readonly result: Extract<RulePreviewResult, { ok: true }> }
  | { readonly status: 'refused'; readonly key: string; readonly code: string; readonly details: Readonly<Record<string, readonly string[]>> }
  | { readonly status: 'failed'; readonly key: string };

const PREVIEW_DEBOUNCE_MS = 250;

const isField = (value: string): value is Field => (FIELDS as readonly string[]).includes(value);

/** The preview command for the current mode and draft — null while the draft cannot be sent. */
function previewChange(mode: Mode, draft: Draft | null) {
  if (mode.kind === 'delete') return { kind: 'delete' as const, ruleId: mode.ruleId };
  if (draft === null) return null;
  const priority = Number(draft.priority);
  if (!Number.isInteger(priority) || priority < 1 || !draft.name.trim() || !draft.matchValue.trim() || !draft.wpId) {
    return null;
  }
  const rule = {
    name: draft.name,
    priority,
    wpId: draft.wpId,
    matchField: draft.matchField,
    matchValue: draft.matchValue,
  };
  return mode.kind === 'edit' ? { kind: 'update' as const, ruleId: mode.ruleId, ...rule } : { kind: 'create' as const, ...rule };
}

/** `ids` with `id` moved to `to` (an index into the result). */
function moved(ids: readonly string[], id: string, to: number): string[] {
  const rest = ids.filter((x) => x !== id);
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * Story 5.10 / UX-DR22: the Rules section — an ordered, editable list of Mapping Rules.
 *
 *   * Create, edit and delete each show the MOVE PREVIEW first ("+14 Tickets / +32h would move to
 *     WP 2.3; 2 Tickets leave WP 2.1"), and the Save / Delete button stays DISABLED until the
 *     preview for exactly the current draft has loaded. A draft the save would refuse previews as
 *     the refusal, so Save never enables on it.
 *   * Reorder by the drag handle, or with the handle focused, `Alt+↑ / Alt+↓` — the keyboard path
 *     for the one pointer action. A reorder applies immediately (no preview) and reports how many
 *     Tickets moved.
 *
 * Every row carries `id="rule-<id>"`, the anchor the Review's "moved to Unmapped by rule '…'"
 * links to.
 */
export function MappingRulesEditor({
  projectId,
  rules,
  leafWps,
}: {
  projectId: string;
  rules: readonly RuleRow[];
  leafWps: readonly LeafWp[];
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const formId = useId();
  const wpLabel = useMemo(() => new Map(leafWps.map((w) => [w.id, w.label])), [leafWps]);
  const ordered = useMemo(() => [...rules].sort((a, b) => a.priority - b.priority), [rules]);

  const change = mode ? previewChange(mode, draft) : null;
  // The live rule list the preview was computed against: a reorder or refresh while the form is
  // open changes it, which invalidates the preview and disables Save until it reloads.
  const rulesFingerprint = ordered.map((r) => `${r.id}:${r.priority}`).join(',');
  // A plain-string key (no JSON: AD-4 keeps JSON.stringify away from anything that could carry a
  // bigint) — identical drafts share it, so an equal re-render never refetches.
  const draftKey = change
    ? change.kind === 'delete'
      ? `delete\u0000${change.ruleId}`
      : [
          change.kind,
          change.kind === 'update' ? change.ruleId : '',
          change.name,
          change.priority,
          change.wpId,
          change.matchField,
          change.matchValue,
        ].join('\u0000')
    : null;
  const changeKey = draftKey === null ? null : `${draftKey}\u0001${rulesFingerprint}`;

  // The preview follows the draft (debounced); only the answer for the CURRENT draft counts.
  useEffect(() => {
    if (!change || changeKey === null) {
      setPreview(null);
      return;
    }
    setPreview({ status: 'loading', key: changeKey });
    let live = true;
    const timer = setTimeout(() => {
      previewMappingRule({ projectId, change })
        .then((result) => {
          if (!live) return;
          setPreview(
            result.ok
              ? { status: 'ready', key: changeKey, result }
              : { status: 'refused', key: changeKey, code: result.code, details: result.details },
          );
        })
        .catch(() => {
          if (live) setPreview({ status: 'failed', key: changeKey });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `change` is derived from `changeKey`: the key is the dependency, so a re-render with an
    // equal draft does not refetch.
  }, [changeKey, projectId]);

  // Keyboard reorder keeps focus on the moved rule's handle across the refresh.
  useEffect(() => {
    if (focusRuleId === null) return;
    const handle = handles.current.get(focusRuleId);
    if (!handle || handle.disabled) return; // still pending: wait for the refreshed list
    handle.focus();
    setFocusRuleId(null); // once: later renders must not pull focus back
  }, [rules, focusRuleId, pending]);

  const previewReady = preview?.status === 'ready' && preview.key === changeKey;

  function open(next: Mode) {
    setStatus(null);
    setMode(next);
    if (next.kind === 'create') {
      const top = ordered.reduce((max, r) => Math.max(max, r.priority), 0);
      setDraft({ name: '', priority: String(top + 1), matchField: 'category', matchValue: '', wpId: '' });
    } else {
      const rule = ordered.find((r) => r.id === next.ruleId)!;
      setDraft({
        name: rule.name,
        priority: String(rule.priority),
        matchField: isField(rule.match.field) ? rule.match.field : 'category',
        matchValue: rule.displayValue,
        wpId: rule.wpId,
      });
    }
  }

  function close() {
    setMode(null);
    setDraft(null);
    setPreview(null);
  }

  function refusalText(code: string, details: Readonly<Record<string, readonly string[]>>): string {
    const rule = Object.values(details).flat()[0];
    if (rule && ['priority_taken', 'not_leaf', 'unknown_parent', 'order_mismatch'].includes(rule)) {
      return t(`mapping.rules_editor.refusal.${rule}`);
    }
    return code === 'not_found' ? t('mapping.rules_editor.refusal.not_found') : t('mapping.rules_editor.refusal.invalid');
  }

  function report(result: RuleActionResult, done: 'saved' | 'deleted' | 'reordered') {
    if (result.ok) {
      setStatus(t(`mapping.rules_editor.${done}`, { moved: result.moved }));
      if (done !== 'reordered') close();
    } else {
      setStatus(refusalText(result.code, result.details));
    }
  }

  /** Runs a server action; a rejected call (network, server error) becomes a status line. */
  async function attempt(run: () => Promise<void>) {
    try {
      await run();
    } catch {
      setStatus(t('mapping.rules_editor.action_failed'));
    }
  }

  function submit() {
    if (!mode || !previewReady || pending) return;
    startTransition(() =>
      attempt(async () => {
        if (mode.kind === 'delete') {
          report(await removeMappingRule({ projectId, ruleId: mode.ruleId }), 'deleted');
          return;
        }
        if (!draft) return;
        report(
          await saveMappingRule({
            projectId,
            ...(mode.kind === 'edit' ? { ruleId: mode.ruleId } : {}),
            name: draft.name,
            priority: Number(draft.priority),
            wpId: draft.wpId,
            matchField: draft.matchField,
            matchValue: draft.matchValue,
          }),
          'saved',
        );
      }),
    );
  }

  function reorder(ids: readonly string[], focus: string | null) {
    if (pending) return;
    const current = ordered.map((r) => r.id);
    if (ids.every((id, i) => id === current[i])) return;
    setFocusRuleId(focus);
    startTransition(() =>
      attempt(async () => {
        report(await reorderMappingRuleList({ projectId, orderedRuleIds: [...ids] }), 'reordered');
      }),
    );
  }

  function onHandleKey(e: React.KeyboardEvent<HTMLButtonElement>, ruleId: string, index: number) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const to = e.key === 'ArrowUp' ? index - 1 : index + 1;
    if (to < 0 || to >= ordered.length) return;
    reorder(moved(ordered.map((r) => r.id), ruleId, to), ruleId);
  }

  function previewLines(result: Extract<RulePreviewResult, { ok: true }>): string[] {
    const label = (wpId: string) => wpLabel.get(wpId) ?? wpId;
    const lines = [
      // Ticket-Count Mode has no hours: say the count only, never "+0h".
      ...result.arrivals.map((f) =>
        result.hoursAvailable
          ? t('mapping.rules_editor.preview_arrival', { tickets: f.tickets, hours: f.hours, wp: label(f.wpId) })
          : t('mapping.rules_editor.preview_arrival_count', { tickets: f.tickets, wp: label(f.wpId) }),
      ),
      ...result.departures.map((f) => t('mapping.rules_editor.preview_departure', { tickets: f.tickets, wp: label(f.wpId) })),
      ...(result.toUnmapped.tickets === 0
        ? []
        : result.hoursAvailable
          ? [t('mapping.rules_editor.preview_unmapped', { tickets: result.toUnmapped.tickets, hours: result.toUnmapped.hours })]
          : [t('mapping.rules_editor.preview_unmapped_count', { tickets: result.toUnmapped.tickets })]),
    ];
    return lines.length > 0 ? lines : [t('mapping.rules_editor.preview_none')];
  }

  const target = mode && mode.kind !== 'create' ? ordered.find((r) => r.id === mode.ruleId) : undefined;

  return (
    <div data-testid="mapping-rules-editor" aria-busy={pending || undefined}>
      <p className="caption" style={{ marginBottom: 8 }}>{t('mapping.rules_editor.reorder_hint')}</p>
      {ordered.length === 0 ? (
        <p className="caption">{t('mapping.rules_editor.empty')}</p>
      ) : (
        <table className="ledger" data-testid="rules-table">
          <thead>
            <tr>
              <th aria-hidden />
              <th className="num">{t('mapping.priority')}</th>
              <th>{t('mapping.rule')}</th>
              <th>{t('mapping.condition')}</th>
              <th>{t('mapping.target_work_package')}</th>
              <th className="num">{t('mapping.tickets_mapped_now')}</th>
              <th>{t('mapping.rules_editor.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((rule, index) => (
              <tr
                key={rule.id}
                id={`rule-${rule.id}`}
                data-testid={`rule-${rule.id}`}
                onDragOver={(e) => {
                  if (dragId !== null && dragId !== rule.id) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId === null) return;
                  reorder(moved(ordered.map((r) => r.id), dragId, index), dragId);
                  setDragId(null);
                }}
                style={{ opacity: dragId === rule.id ? 0.5 : 1 }}
              >
                <td>
                  <button
                    type="button"
                    className="btn"
                    draggable={!pending}
                    ref={(el) => {
                      if (el) handles.current.set(rule.id, el);
                      else handles.current.delete(rule.id);
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', rule.id);
                      setDragId(rule.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onKeyDown={(e) => onHandleKey(e, rule.id, index)}
                    aria-label={t('mapping.rules_editor.handle_aria', { name: rule.name })}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                    disabled={pending}
                    style={{ cursor: pending ? 'default' : 'grab' }}
                  >
                    ⠿
                  </button>
                </td>
                <td className="num">{rule.priority}</td>
                <td>{rule.name}</td>
                <td>
                  <code>
                    {isField(rule.match.field) ? t(`mapping.rules_editor.fields.${rule.match.field}`) : rule.match.field} ={' '}
                    {rule.displayValue}
                  </code>
                </td>
                <td>{rule.wpLabel}</td>
                <td className="num">{rule.currentlyMapped}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn" disabled={pending} onClick={() => open({ kind: 'edit', ruleId: rule.id })}>
                      {t('mapping.rules_editor.edit')}
                    </button>
                    <button type="button" className="btn" disabled={pending} onClick={() => open({ kind: 'delete', ruleId: rule.id })}>
                      {t('mapping.rules_editor.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p role="status" aria-live="polite" className="caption" style={{ minHeight: 18, marginTop: 8 }} data-testid="rules-status">
        {status}
      </p>

      {mode === null ? (
        <button type="button" className="btn" disabled={pending} onClick={() => open({ kind: 'create' })}>
          {t('mapping.rules_editor.new_rule')}
        </button>
      ) : (
        <section
          aria-labelledby={`${formId}-heading`}
          data-testid="rule-form"
          style={{ border: '1px solid var(--border, #94a3b8)', padding: 12, marginTop: 8 }}
        >
          <h3 id={`${formId}-heading`} className="label">
            {mode.kind === 'create'
              ? t('mapping.rules_editor.form_create_heading')
              : mode.kind === 'edit'
                ? t('mapping.rules_editor.form_edit_heading', { name: target?.name ?? '' })
                : t('mapping.rules_editor.delete_heading', { name: target?.name ?? '' })}
          </h3>

          {mode.kind !== 'delete' && draft && (
            <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 12px', alignItems: 'center' }}>
              <label htmlFor={`${formId}-name`}>{t('mapping.rules_editor.name')}</label>
              <input id={`${formId}-name`} value={draft.name} maxLength={200} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <label htmlFor={`${formId}-priority`}>{t('mapping.rules_editor.priority')}</label>
              <input
                id={`${formId}-priority`}
                type="number"
                min={1}
                step={1}
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              />
              <label htmlFor={`${formId}-field`}>{t('mapping.rules_editor.field')}</label>
              <select
                id={`${formId}-field`}
                value={draft.matchField}
                onChange={(e) => isField(e.target.value) && setDraft({ ...draft, matchField: e.target.value })}
              >
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {t(`mapping.rules_editor.fields.${f}`)}
                  </option>
                ))}
              </select>
              <label htmlFor={`${formId}-value`}>{t('mapping.rules_editor.value')}</label>
              <div>
                <input
                  id={`${formId}-value`}
                  value={draft.matchValue}
                  maxLength={200}
                  aria-describedby={`${formId}-value-hint`}
                  onChange={(e) => setDraft({ ...draft, matchValue: e.target.value })}
                />
                <div id={`${formId}-value-hint`} className="caption">
                  {t(`mapping.rules_editor.value_hint.${draft.matchField}`)}
                </div>
              </div>
              <label htmlFor={`${formId}-wp`}>{t('mapping.rules_editor.target')}</label>
              <select id={`${formId}-wp`} value={draft.wpId} onChange={(e) => setDraft({ ...draft, wpId: e.target.value })}>
                <option value="" disabled>
                  {t('mapping.rules_editor.target_placeholder')}
                </option>
                {leafWps.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div aria-live="polite" data-testid="rule-preview" style={{ marginTop: 12 }}>
            <div className="label">{t('mapping.rules_editor.preview_heading')}</div>
            {preview === null || preview.key !== changeKey ? (
              change === null ? null : <p className="caption">{t('mapping.rules_editor.preview_loading')}</p>
            ) : preview.status === 'loading' ? (
              <p className="caption">{t('mapping.rules_editor.preview_loading')}</p>
            ) : preview.status === 'ready' ? (
              <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                {previewLines(preview.result).map((line, index) => (
                  <li key={`${index}:${line}`}>{line}</li>
                ))}
              </ul>
            ) : preview.status === 'refused' ? (
              <p className="caption" role="alert">
                {refusalText(preview.code, preview.details)}
              </p>
            ) : (
              <p className="caption" role="alert">
                {t('mapping.rules_editor.preview_failed')}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn" onClick={submit} disabled={!previewReady || pending} data-testid="rule-save">
              {mode.kind === 'delete' ? t('mapping.rules_editor.confirm_delete') : t('mapping.rules_editor.save')}
            </button>
            <button type="button" className="btn" onClick={close} disabled={pending}>
              {t('mapping.rules_editor.cancel')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
