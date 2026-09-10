// Performance Tracker (Command Center) — pure functions only, ported verbatim
// from the Streamlit Performance Tracker (app.py lines 2104-2161). Two real
// formulas exist on this page; everything else (KPI values, sparkline trends,
// category panels) is literal source data with no derivation, carried as-is
// in scenarios.json's performanceTracker block.
import type { CostStructureBaseline } from '../data/types';

/**
 * Streamlit: cost_values[4] = max(100 - food_cost_pct - 20.0 - 2.1 - 9.4, 0).
 * This is an independent remainder, not tied to grossMarginPct shown elsewhere
 * on the same chart — see the migration report for that known inconsistency.
 */
export function costStructureRemainder(cs: CostStructureBaseline): number {
  return Math.max(100 - cs.foodCostPct - cs.labourTargetPct - cs.packagingPct - cs.overheadPct, 0);
}

export interface FoodCostProjection {
  /** Historical labels followed by the two projected labels ("Aug*", "Sep*" — hardcoded in the source, not derived from the last historical month). */
  months: string[];
  /** Historical trend values followed by the two projected values. */
  trend: number[];
  /** Historical target values followed by the target held flat for both projected months. */
  target: number[];
  /** trend[i]/months[i] for i >= historicalCount are the projected points. */
  historicalCount: number;
}

/**
 * Streamlit: slope = food_cost_trend[-1] - food_cost_trend[-2]; naive single-step
 * linear extrapolation two months out. Not a regression, no confidence interval —
 * reproduced exactly, including that simplicity.
 */
export function projectFoodCostTrend(months: string[], trend: number[], target: number[]): FoodCostProjection {
  const slope = trend[trend.length - 1] - trend[trend.length - 2];
  const lastTrend = trend[trend.length - 1];
  const lastTarget = target[target.length - 1];
  const projectedTrend = [1, 2].map((i) => round1(lastTrend + slope * i));
  return {
    months: [...months, 'Aug*', 'Sep*'],
    trend: [...trend, ...projectedTrend],
    target: [...target, lastTarget, lastTarget],
    historicalCount: months.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
