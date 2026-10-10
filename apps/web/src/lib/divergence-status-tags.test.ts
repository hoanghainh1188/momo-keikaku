/**
 * Story 6.2: EV-fall / low-evidence tags on Divergence — present/absent by row flags.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { divergenceStatusTags, type DivergenceStatusTag } from './divergence-status-tags';

function renderTags(tags: readonly DivergenceStatusTag[]): string {
  return renderToStaticMarkup(
    createElement(
      'td',
      null,
      tags.map((tag) =>
        createElement(
          'span',
          {
            key: tag.key,
            className: 'tag',
            ...(tag.testId ? { 'data-testid': tag.testId } : {}),
          },
          tag.key,
        ),
      ),
    ),
  );
}

describe('divergenceStatusTags (story 6.2)', () => {
  it('includes data-testid="ev-fell" when evFell is true', () => {
    const html = renderTags(
      divergenceStatusTags({ lowEvidence: false, baselineMh: 1000n, evFell: true }),
    );
    expect(html).toContain('data-testid="ev-fell"');
  });

  it('omits data-testid="ev-fell" when evFell is false', () => {
    const html = renderTags(
      divergenceStatusTags({ lowEvidence: true, baselineMh: 1000n, evFell: false }),
    );
    expect(html).not.toContain('data-testid="ev-fell"');
    expect(html).toContain('low_evidence');
  });

  it('skips low_evidence when baseline hours are zero', () => {
    expect(
      divergenceStatusTags({ lowEvidence: true, baselineMh: 0n, evFell: false }),
    ).toEqual([]);
  });

  it('includes estimate-driven tag when estimateDrivenEv is true (story 6.4)', () => {
    const html = renderTags(
      divergenceStatusTags({
        lowEvidence: false,
        baselineMh: 1000n,
        evFell: false,
        estimateDrivenEv: true,
      }),
    );
    expect(html).toContain('data-testid="estimate-driven-ev"');
    expect(html).toContain('estimate_driven');
  });
});
