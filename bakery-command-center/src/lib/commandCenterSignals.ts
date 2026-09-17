// Deterministic "what needs attention" rules for Command Center Overview.
// Every rule here compares Overview's own current-period KPIs against a
// reference value that already exists elsewhere in the app data — never an
// invented threshold. No AI, no hardcoded example alerts: an empty result
// means nothing is currently flagged, not a placeholder waiting to be filled.
import type { AnalysisSignal, Kpis, PeriodGranularity } from '../data/types';
import { scenariosFile } from '../data';

const { meta, scenarios } = scenariosFile;

export interface AttentionItem {
  signal: AnalysisSignal;
  title: string;
  reason: string;
  linkLabel: string;
}

/**
 * gmTargetPlan only has data for Jul (month), Q4 (quarter), and YTD — it does
 * not cover Aug-Jun. Returns undefined rather than falling back to a
 * mismatched period's target.
 */
function matchingGmTargetCell(granularity: PeriodGranularity, selectedMonth: string, selectedQuarter: string) {
  const plan = scenarios.gmTargetPlan;
  if (granularity === 'ytd') return plan.ytd;
  if (granularity === 'quarter') return selectedQuarter === 'Q4' ? plan.quarters.Q4 : undefined;
  return selectedMonth === 'Jul' ? plan.months.Jul : undefined;
}

export function computeAttentionItems(
  kpis: Kpis,
  granularity: PeriodGranularity,
  selectedMonth: string,
  selectedQuarter: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  const wastagePct = (kpis.wastageCost.value / kpis.revenue.value) * 100;
  if (wastagePct > meta.wastageTarget) {
    items.push({
      signal: 'wastage',
      title: 'Wastage above target',
      reason: `Wastage running at ${wastagePct.toFixed(1)}% of revenue, above the ${meta.wastageTarget}% target.`,
      linkLabel: 'Investigate wastage →',
    });
  }

  const targetCell = matchingGmTargetCell(granularity, selectedMonth, selectedQuarter);
  if (targetCell && kpis.grossMargin.value < targetCell.kpis.grossMargin.value) {
    const gap = targetCell.kpis.grossMargin.value - kpis.grossMargin.value;
    items.push({
      signal: 'margin',
      title: 'Margin below GM Target Plan',
      reason: `Gross margin at ${kpis.grossMargin.value}% is running ${gap.toFixed(1)}pt below the ${targetCell.kpis.grossMargin.value}% GM Target Plan for this period.`,
      linkLabel: 'View margin drivers →',
    });
  }

  return items;
}
