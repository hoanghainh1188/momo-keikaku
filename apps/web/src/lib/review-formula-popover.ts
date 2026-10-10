/** Client-safe formula popover view model (built on the server from ReviewResult.formulaMetrics). */

export type FormulaPopoverModel = {
  formula: string;
  inputs: { label: string; value: string }[];
  interpretation: string;
  periodChange: string;
  drillDown: { wbsCode: string; name: string; contribution: string; tickets: string[] }[];
};

export type FormulaMetricDetailLike = {
  id: string;
  interpretationKey: string;
  inputs: { labelKey: string; value: string }[];
  periodChange: string;
  drillDown: { wbsCode: string; name: string; contribution: string; tickets: string[] }[];
};

type TFn = (key: string, values?: Record<string, string | number>) => string;

export function toFormulaPopoverModel(
  detail: FormulaMetricDetailLike,
  formulaText: string,
  t: TFn,
): FormulaPopoverModel {
  const interpretation =
    detail.interpretationKey === 'neutral'
      ? ''
      : t(`review.metric_formula.interpret.${detail.interpretationKey}`);

  return {
    formula: formulaText,
    inputs: detail.inputs.map((inp) => ({
      label: t(`review.metric_formula.input.${inp.labelKey}`),
      value: inp.value,
    })),
    interpretation,
    periodChange: t('review.metric_formula.period_change_value', { delta: detail.periodChange }),
    drillDown: detail.drillDown,
  };
}

export function interpretationText(detail: FormulaMetricDetailLike | undefined, t: TFn): string {
  if (!detail || detail.interpretationKey === 'neutral') return '';
  return t(`review.metric_formula.interpret.${detail.interpretationKey}`);
}
