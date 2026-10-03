import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { setBaselineAction } from '@/app/p/[projectId]/baselines/actions';

export type SetBaselineControlProps = {
  readonly projectId: string;
  readonly canSet: boolean;
  readonly hasBaseline: boolean;
  readonly notSchedulableCount: number;
  readonly exceptionsRailHref: string;
  /** Optional test id suffix so Review / Plan / Baselines do not collide. */
  readonly testId?: string;
};

/**
 * Story 4.1 — *Set Baseline* control. Disabled with count + Plan exceptions-rail link when
 * not schedulable (UX-DR23). Hidden once a Baseline already exists (Re-baseline is 4.3).
 */
export async function SetBaselineButton({
  projectId,
  canSet,
  hasBaseline,
  notSchedulableCount,
  exceptionsRailHref,
  testId = 'set-baseline',
}: SetBaselineControlProps) {
  const t = await getTranslations();
  if (hasBaseline) return null;

  if (!canSet) {
    return (
      <div className="btn-row" data-testid={`${testId}-disabled`}>
        <button type="button" className="btn" disabled title={t('baselines.set_disabled_title')}>
          {t('baselines.set_baseline')}
        </button>
        {notSchedulableCount > 0 ? (
          <Link
            className="caption"
            href={exceptionsRailHref}
            data-testid={`${testId}-exceptions-link`}
          >
            {t('baselines.not_schedulable_link', { count: notSchedulableCount })}
          </Link>
        ) : (
          <span className="caption" data-testid={`${testId}-blocked`}>
            {t('baselines.set_blocked')}
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={setBaselineAction} className="btn-row" data-testid={testId}>
      <input type="hidden" name="projectId" value={projectId} />
      <button type="submit" className="btn primary">
        {t('baselines.set_baseline')}
      </button>
    </form>
  );
}
