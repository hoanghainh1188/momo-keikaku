/**
 * @vitest-environment jsdom
 *
 * Story 6.5 / Q2-A: HealthBadge disclosure — click/Enter/Space toggle, Esc closes + focus return.
 */
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { HealthBadge } = await import('./health-badge');

function mount(disclosure = 'Amber because SPI 0.90 is between 0.85 and 0.95 · driver SPI 0.90'): {
  root: Root;
  container: HTMLDivElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(HealthBadge, {
        colour: 'amber',
        label: 'amber · SPI 0.90',
        disclosure,
        disclosureTitle: 'Threshold rule & driving figure',
        closeLabel: 'Close',
      }),
    );
  });
  return { root, container };
}

describe('HealthBadge disclosure', () => {
  let mounted: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    mounted = null;
  });

  afterEach(() => {
    if (mounted) {
      act(() => mounted!.root.unmount());
      mounted.container.remove();
      mounted = null;
    }
  });

  it('opens via click and shows the disclosure body', () => {
    mounted = mount();
    const trigger = mounted.container.querySelector(
      '[data-testid="health-badge-trigger"]',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(mounted.container.querySelector('[data-testid="health-disclosure"]')).toBeNull();

    act(() => {
      trigger.click();
    });

    const pop = mounted.container.querySelector('[data-testid="health-disclosure"]');
    expect(pop).toBeTruthy();
    expect(pop!.textContent).toContain('Amber because SPI 0.90');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens via Enter and toggles closed via Space', () => {
    mounted = mount();
    const trigger = mounted.container.querySelector(
      '[data-testid="health-badge-trigger"]',
    ) as HTMLButtonElement;

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mounted.container.querySelector('[data-testid="health-disclosure"]')).toBeTruthy();

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(mounted.container.querySelector('[data-testid="health-disclosure"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc closes the disclosure and returns focus to the trigger', () => {
    mounted = mount();
    const trigger = mounted.container.querySelector(
      '[data-testid="health-badge-trigger"]',
    ) as HTMLButtonElement;

    act(() => {
      trigger.focus();
      trigger.click();
    });
    expect(mounted.container.querySelector('[data-testid="health-disclosure"]')).toBeTruthy();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(mounted.container.querySelector('[data-testid="health-disclosure"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
