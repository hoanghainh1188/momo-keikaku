/**
 * Gantt-lite: the Baseline as a hollow outline bar above the Current Plan's solid
 * indigo bar, with earned progress filling the Current bar in ink from the left.
 * Drawn with the same inks as the table around it — not a decorative panel.
 */
export interface GanttScale {
  from: string;
  to: string;
  fromMs: number;
  spanMs: number;
}

export function ganttScale(from: string, to: string): GanttScale {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return { from, to, fromMs, spanMs: Math.max(toMs - fromMs, 86_400_000) };
}

const pct = (scale: GanttScale, date: string) =>
  ((Date.parse(`${date}T00:00:00Z`) - scale.fromMs) / scale.spanMs) * 100;

export function GanttRow({
  scale,
  baseline,
  current,
  pctComplete,
  isMilestone,
  slipped,
}: {
  scale: GanttScale;
  baseline: { start: string; finish: string } | null;
  current: { start: string; finish: string } | null;
  pctComplete: number;
  isMilestone: boolean;
  slipped: boolean;
}) {
  if (isMilestone) {
    const at = baseline?.finish ?? current?.finish;
    if (!at) return <div className="gantt-track" />;
    return (
      <div className="gantt-track">
        <span
          className={`gantt-milestone${slipped ? ' slipped' : ''}`}
          style={{ left: `calc(${pct(scale, at)}% - 4px)` }}
          title={`Milestone ${at}${slipped ? ' — slipped' : ''}`}
        />
      </div>
    );
  }

  return (
    <div className="gantt-track">
      {baseline ? (
        <span
          className="gantt-baseline"
          style={{
            left: `${pct(scale, baseline.start)}%`,
            width: `${Math.max(pct(scale, baseline.finish) - pct(scale, baseline.start), 0.6)}%`,
          }}
          title={`Baseline ${baseline.start} → ${baseline.finish}`}
        />
      ) : null}
      {current ? (
        <>
          <span
            className="gantt-current"
            style={{
              left: `${pct(scale, current.start)}%`,
              width: `${Math.max(pct(scale, current.finish) - pct(scale, current.start), 0.6)}%`,
            }}
            title={`Current Plan ${current.start} → ${current.finish}`}
          />
          <span
            className="gantt-earned"
            style={{
              left: `${pct(scale, current.start)}%`,
              width: `${Math.max((pct(scale, current.finish) - pct(scale, current.start)) * pctComplete, 0)}%`,
            }}
            title={`Earned ${(pctComplete * 100).toFixed(0)}%`}
          />
        </>
      ) : null}
    </div>
  );
}
