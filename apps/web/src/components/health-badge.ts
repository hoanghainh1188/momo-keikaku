'use client';

/**
 * Health badge: glyph + word (+ optional driver). Story 6.5 / Q2-A: when `disclosure` is set,
 * click/Enter/Space toggles a non-modal popover (threshold rule + driving figure); Esc returns focus.
 *
 * Implemented with `createElement` (no JSX) so node vitest can import it without a JSX transform
 * (apps/web tsconfig uses `jsx: "preserve"` for Next).
 */
import {
  createElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

const GLYPH: Record<string, string> = {
  green: '●',
  amber: '▲',
  red: '◆',
  unavailable: '–',
};

export function HealthBadge({
  colour,
  label,
  word,
  disclosure,
  disclosureTitle,
  closeLabel,
}: {
  colour: string;
  label?: string;
  /** Colour word for glyph+word+rule display (defaults to `colour`). */
  word?: string;
  /** Hover/focus / click disclosure body (threshold rule + driving figure). */
  disclosure?: string | null;
  disclosureTitle?: string;
  closeLabel?: string;
}): ReactElement {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const interactive = Boolean(disclosure);
  const display = label ?? word ?? colour;

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [open]);

  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open]);

  const badge: ReactNode = createElement(
    'span',
    { className: `badge ${colour}` },
    createElement('span', { 'aria-hidden': true }, GLYPH[colour]),
    display,
  );

  if (!interactive) return badge as ReactElement;

  return createElement(
    'span',
    { className: 'health-badge-wrap' },
    createElement(
      'button',
      {
        type: 'button',
        ref: triggerRef,
        className: 'health-badge-trigger',
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'aria-controls': open ? titleId : undefined,
        'data-testid': 'health-badge-trigger',
        title: disclosure ?? undefined,
        onClick: () => setOpen((v) => !v),
        onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        },
      },
      badge,
    ),
    open && disclosure
      ? createElement(
          'div',
          {
            ref: popRef,
            className: 'formula-popover health-disclosure',
            role: 'dialog',
            'aria-modal': false,
            'aria-labelledby': titleId,
            tabIndex: -1,
            'data-testid': 'health-disclosure',
          },
          createElement(
            'p',
            { id: titleId, className: 'formula-popover-formula' },
            disclosureTitle ?? 'Health rule',
          ),
          createElement('p', { className: 'formula-popover-interpret' }, disclosure),
          createElement(
            'button',
            {
              type: 'button',
              className: 'formula-popover-close caption',
              onClick: () => {
                setOpen(false);
                triggerRef.current?.focus();
              },
            },
            closeLabel ?? 'Close',
          ),
        )
      : null,
  );
}
