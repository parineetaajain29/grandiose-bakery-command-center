// AI Presentation Builder — Step 5: deterministic chart-type selection.
// Nothing here calls Claude or makes a judgment call about wording — this
// is a pure, fixed lookup from {data category, verified data} to a chart
// spec pptxBuilder.ts (Step 6) can hand straight to pptxgenjs. Same
// category always produces the same chart shape; the only thing that
// varies is the real numbers plugged in. This is what the spec means by
// "deterministic chart-type selection" (never random variety for its own
// sake) and it is also a second, independent safety net against
// fabrication: a chart is built directly from the same verified `data`
// object presentationNarrative.ts already fetched, never from anything
// Claude wrote.
//
// Colors are pulled from this app's own light-mode design tokens
// (src/styles/tokens.css's `:root.light` block) — a generated deck is
// always read on a white/off-white background regardless of which theme
// the dashboard itself is in, so the light-mode values are the correct,
// real source here, not an invented palette. Colors carry meaning only
// where the spec calls for it (over/under target, current/optimized,
// availability-driven vs. execution-driven) — every other chart uses the
// single accent-blue series, never a rainbow.
import type { DataCategoryId } from './presentationPlanner.ts';
import type { WastageBreakdown, TrendSeries } from './presentationData.ts';
import type { AttentionCandidate, SkuMetric } from './copilotTools.ts';
import type { Sku } from '../../src/lib/skuCalc.ts';
import type { DivisionSummaryRow } from '../../src/lib/skuCalc.ts';
import type { DerivedB2BSummary } from '../../src/lib/b2bCalc.ts';
import type { OptimizationResult, OptimizationOptimalResult } from '../../src/data/api.ts';

// Light-mode token values, copied deliberately rather than imported (tokens.css
// is a CSS asset, not a TS module) — see this file's header for why light-mode
// is the correct fixed palette for a generated deck.
export const DECK_COLORS = {
  bgPrimary: 'FCFBF8',
  bgPanel: 'FFFFFF',
  bgPanelRaised: 'F5F4F0',
  borderSubtle: 'E8E6DF',
  textPrimary: '1A1A1F',
  textSecondary: '54545E',
  textTertiary: '6B6B74',
  accentBlue: '5B8DEF',
  accentGreen: '03734F',
  accentRed: 'C81F1F',
  accentAmber: 'A35604',
  neutral: '9B9B9B', // "current"/baseline series — mirrors OptimizationLabPage.tsx's var(--text-tertiary) bar fill convention
} as const;

export type ChartKind = 'bar' | 'line' | 'grouped_bar' | 'none';

export interface ChartSeries {
  name: string;
  values: number[];
  /** Per-series color, or per-point colors (must match values.length) when a single series needs point-level meaning (e.g. over/under target). */
  color: string | string[];
}

export interface ChartSpec {
  kind: ChartKind;
  categories: string[];
  series: ChartSeries[];
  /** '%' | 'AED' | '' — how pptxBuilder.ts should format axis/data labels. */
  valueFormat: '%' | 'AED' | 'number';
  /** A dashed horizontal reference line (e.g. a target) — only meaningful for 'bar' and 'line'. */
  referenceLine?: { label: string; value: number };
}

const NO_CHART: ChartSpec = { kind: 'none', categories: [], series: [], valueFormat: 'number' };

// ---------------------------------------------------------------------------
// Per-category builders. Each takes exactly the shape presentationData.ts /
// copilotTools.ts actually returns for that category — the compiler is the
// enforcement that this file never drifts from the real data shape.
// ---------------------------------------------------------------------------

function buildWastageBreakdownChart(data: WastageBreakdown): ChartSpec {
  return {
    kind: 'bar',
    categories: data.byDivision.map((d) => d.division),
    series: [
      {
        name: 'Wastage %',
        values: data.byDivision.map((d) => d.wastagePct),
        color: data.byDivision.map((d) => (d.wastagePct > data.wastageTargetPct ? DECK_COLORS.accentRed : DECK_COLORS.accentGreen)),
      },
    ],
    valueFormat: '%',
    referenceLine: { label: `Target (${data.wastageTargetPct}%)`, value: data.wastageTargetPct },
  };
}

function buildTrendChart(data: TrendSeries): ChartSpec {
  const spec: ChartSpec = {
    kind: 'line',
    categories: data.points.map((p) => p.month),
    series: [{ name: seriesLabelForTrend(data.metric), values: data.points.map((p) => p.value), color: DECK_COLORS.accentBlue }],
    valueFormat: '%',
  };
  if (data.metric === 'foodCost' && typeof data.targetFoodCostPct === 'number') {
    spec.referenceLine = { label: `Target (${data.targetFoodCostPct}%)`, value: data.targetFoodCostPct };
  }
  if (data.metric === 'costUnit') spec.valueFormat = 'AED';
  return spec;
}

function seriesLabelForTrend(metric: TrendSeries['metric']): string {
  switch (metric) {
    case 'foodCost':
      return 'Food cost %';
    case 'wastage':
      return 'Wastage %';
    case 'margin':
      return 'Gross margin %';
    case 'costUnit':
      return 'Cost per unit';
  }
}

function buildSkuRankingChart(data: Sku[], metric: SkuMetric): ChartSpec {
  const valueKey = metric === 'contribution' ? 'contributionPct' : metric === 'revenue' ? 'salesAed' : 'units';
  return {
    kind: 'bar',
    categories: data.map((s) => s.product),
    series: [{ name: seriesLabelForSkuMetric(metric), values: data.map((s) => s[valueKey] as number), color: DECK_COLORS.accentBlue }],
    valueFormat: metric === 'contribution' ? '%' : metric === 'revenue' ? 'AED' : 'number',
  };
}

function seriesLabelForSkuMetric(metric: SkuMetric): string {
  switch (metric) {
    case 'contribution':
      return 'Contribution %';
    case 'revenue':
      return 'Revenue';
    case 'units':
      return 'Units';
  }
}

function buildDivisionSummaryChart(data: DivisionSummaryRow[]): ChartSpec {
  return {
    kind: 'bar',
    categories: data.map((d) => d.division),
    series: [{ name: 'Revenue', values: data.map((d) => d.salesAed), color: DECK_COLORS.accentBlue }],
    valueFormat: 'AED',
  };
}

function buildB2BRankingChart(data: { name: string; value: number; unit: string }[]): ChartSpec {
  const unit = data[0]?.unit ?? '';
  const isAed = unit.toLowerCase().includes('aed');
  const isPct = unit.includes('%');
  return {
    kind: 'bar',
    categories: data.map((d) => d.name),
    series: [{ name: unit || 'Value', values: data.map((d) => d.value), color: DECK_COLORS.accentBlue }],
    valueFormat: isAed ? 'AED' : isPct ? '%' : 'number',
  };
}

function buildB2BSummaryChart(data: DerivedB2BSummary & { receivables: { total: number; past60: number; buckets: [number, number, number, number] } }): ChartSpec {
  const buckets = data.receivables.buckets;
  return {
    kind: 'bar',
    categories: ['0-30 days', '31-60 days', '61-90 days', '90+ days'],
    series: [
      {
        name: 'Outstanding (AED)',
        values: buckets,
        // Escalating severity by age — the only place this file uses a 4-step
        // gradient, deliberately restrained to this one aging-bucket case
        // rather than a general-purpose rainbow scale.
        color: [DECK_COLORS.accentBlue, DECK_COLORS.accentBlue, DECK_COLORS.accentAmber, DECK_COLORS.accentRed],
      },
    ],
    valueFormat: 'AED',
  };
}

function buildEmployeeAttentionChart(data: AttentionCandidate[]): ChartSpec {
  return {
    kind: 'bar',
    categories: data.map((e) => e.employeeName),
    series: [
      {
        name: 'Performance gap vs. department (pts)',
        values: data.map((e) => e.gapPct),
        // Amber = the gap tracks with lower paid-time availability rather than
        // execution (spec §15 — never let a downtime-driven gap read as a
        // personnel judgment); red = the gap persists even while working.
        color: data.map((e) => (e.likelyAvailabilityDriven ? DECK_COLORS.accentAmber : DECK_COLORS.accentRed)),
      },
    ],
    valueFormat: '%',
  };
}

/** Only 'optimal' results are chartable — an 'infeasible' result has no current/optimized pair to compare, so it renders as a text/table notice on the slide instead (pptxBuilder.ts's job, not this file's). */
function buildOptimizationChart(result: OptimizationOptimalResult): ChartSpec {
  const topChanges = [...result.sku_changes].sort((a, b) => Math.abs(b.absolute_change) - Math.abs(a.absolute_change)).slice(0, 8);
  return {
    kind: 'grouped_bar',
    categories: topChanges.map((c) => c.sku),
    series: [
      { name: 'Current production', values: topChanges.map((c) => c.current_production), color: DECK_COLORS.neutral },
      { name: 'Optimized production', values: topChanges.map((c) => c.optimized_production), color: DECK_COLORS.accentBlue },
    ],
    valueFormat: 'number',
  };
}

// ---------------------------------------------------------------------------
// Dispatch — matches the DataCategoryId union exactly (a missing case is a
// compile error), so a new category added to the planner's catalog can never
// silently fall through with no chart.
// ---------------------------------------------------------------------------
export function buildChartSpec(categoryId: DataCategoryId, data: unknown, params?: Record<string, unknown>): ChartSpec {
  switch (categoryId) {
    case 'wastage_breakdown':
      return buildWastageBreakdownChart(data as WastageBreakdown);
    case 'trend_food_cost':
    case 'trend_wastage':
    case 'trend_margin':
    case 'trend_cost_unit':
      return buildTrendChart(data as TrendSeries);
    case 'sku_ranking': {
      const metric: SkuMetric = params?.metric === 'revenue' || params?.metric === 'units' ? params.metric : 'contribution';
      return buildSkuRankingChart(data as Sku[], metric);
    }
    case 'sku_division_summary':
      return buildDivisionSummaryChart(data as DivisionSummaryRow[]);
    case 'b2b_ranking':
      return buildB2BRankingChart(data as { name: string; value: number; unit: string }[]);
    case 'b2b_summary':
      return buildB2BSummaryChart(data as DerivedB2BSummary & { receivables: { total: number; past60: number; buckets: [number, number, number, number] } });
    case 'employee_attention':
      return buildEmployeeAttentionChart(data as AttentionCandidate[]);
    case 'optimization_snapshot': {
      const snapshot = data as { result: OptimizationResult; isDemoData: boolean };
      if (snapshot.result.status !== 'optimal') return NO_CHART;
      return buildOptimizationChart(snapshot.result);
    }
    case 'command_center_attention': // list of qualitative flags — rendered as a table/list on the slide, not a chart
    case 'ai_risk_research': // narrative + supplier table content — not chart-shaped
      return NO_CHART;
  }
}
