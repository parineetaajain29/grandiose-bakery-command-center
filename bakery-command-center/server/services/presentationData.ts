// AI Presentation Builder — verified-data query layer (spec §7/§8: "data
// first, AI second"). Every function here returns a ToolResult<T> built with
// copilotTools.ts's own ok()/err()/roundNumbers() so a presentation slide's
// numbers travel through exactly the same "rounded once, at the source"
// envelope Copilot's evidence panel already relies on — never a second,
// slightly-different convention invented for decks.
//
// Nothing in this file calls an LLM. presentationPlanner.ts (Step 3) decides
// WHICH of these functions to call for a given objective; presentationNarrative.ts
// (Step 4) is the only place Claude ever sees the numbers these return, and
// even then only via {{token}} substitution into pre-approved sentence
// templates — never as a spreadsheet it narrates freely. See copilotTools.ts's
// own top-of-file comment for why that split is what prevents a hallucinated
// number in the deck.
//
// IMPORTANT — data-availability constraint discovered while writing this file:
// there is NO per-SKU wastage, cost, or margin field anywhere in this app's
// data model (see src/data/skuData.ts's own header comment — SKU Performance
// only has units sold and sales value). Only two levels of wastage exist:
// bakery-wide (Command Center KPIs, via getWastageBreakdown below) and
// division-level (performanceTracker.wastageByDivision — six divisions, e.g.
// "Baklava", "Viennoiserie", "French Bakery"; itself flagged in
// scenarios.json as new illustrative data for this migration). A wastage
// presentation can therefore honestly say "the Viennoiserie division drives
// the largest share of wastage" but never "the [specific product] SKU
// drives the largest share of wastage" — the planner/narrative layers must
// not ask for, and must not be given a path to fabricate, a per-SKU wastage
// figure (note the Baklava DIVISION above is not the same thing as any
// single Baklava SKU in SKU Performance — don't conflate the two when
// wiring the planner). If a future request genuinely needs a per-SKU
// figure, it has to come from new real data, not from this file.

import { ok, err, resolveCell, type AttentionQuery, type ToolResult } from './copilotTools.ts';
import { scenariosFile } from '../../src/data/index.ts';
import { wastagePctFromKpis } from '../../src/lib/commandCenterSignals.ts';
import type { WastageByDivisionRow } from '../../src/data/types.ts';
import { runOptimization, type OptimizationOutcome } from './optimization.ts';
import { listResearch, type ResearchRecord } from './aiRisk.ts';
import { listSupplierResearchForResearchId, type SupplierResearchRecord } from './supplierIntelligence.ts';

// ---------------------------------------------------------------------------
// Wastage — bakery-wide figure + target (Command Center) and the division
// breakdown (Performance Tracker). Division-level only — see file header.
// ---------------------------------------------------------------------------
export interface WastageBreakdown {
  wastagePct: number;
  wastageCostAed: number;
  wastageTargetPct: number;
  overTargetPct: number;
  byDivision: WastageByDivisionRow[];
  period: string;
}

export function getWastageBreakdown(query: AttentionQuery = {}): ToolResult<WastageBreakdown> {
  const resolved = resolveCell(query);
  if (!resolved) return err('no_data', 'No Command Center data for that period.');

  const { kpis } = resolved.cell;
  const byDivision = scenariosFile.performanceTracker.wastageByDivision;
  if (byDivision.length === 0 && kpis.wastageCost.value === 0) {
    return err('no_data', 'No wastage data available for that period.');
  }

  const wastageTargetPct = scenariosFile.meta.wastageTarget;
  const actualWastagePct = wastagePctFromKpis(kpis);
  const period = resolved.granularity === 'month' ? resolved.month : resolved.granularity === 'quarter' ? resolved.quarter : 'YTD';

  return ok(
    {
      wastagePct: actualWastagePct,
      wastageCostAed: kpis.wastageCost.value,
      wastageTargetPct,
      overTargetPct: actualWastagePct - wastageTargetPct,
      byDivision,
      period,
    },
    `Command Center Overview + Performance Tracker · wastage · ${period}`,
  );
}

// ---------------------------------------------------------------------------
// Performance trends — the static month-over-month arrays Performance
// Tracker already charts (food cost %, wastage %, margin %, cost/unit).
// Returned as {month, value} pairs per series so pptxBuilder.ts can hand
// each straight to a line-chart layout without re-zipping months/values.
// ---------------------------------------------------------------------------
export type TrendMetric = 'foodCost' | 'wastage' | 'margin' | 'costUnit';

export interface TrendSeries {
  metric: TrendMetric;
  points: { month: string; value: number }[];
  targetFoodCostPct?: number;
}

const TREND_ARRAY_KEY: Record<TrendMetric, 'foodCostTrend' | 'wastageTrend' | 'marginTrend' | 'costUnitTrend'> = {
  foodCost: 'foodCostTrend',
  wastage: 'wastageTrend',
  margin: 'marginTrend',
  costUnit: 'costUnitTrend',
};

export function getPerformanceTrend(metric: TrendMetric): ToolResult<TrendSeries> {
  const { months, targetFoodCostPct } = scenariosFile.performanceTracker;
  const values = scenariosFile.performanceTracker[TREND_ARRAY_KEY[metric]];
  if (!values || values.length === 0) return err('no_data', `No ${metric} trend data available.`);

  const points = months.map((month, i) => ({ month, value: values[i] }));
  return ok(
    { metric, points, ...(metric === 'foodCost' ? { targetFoodCostPct } : {}) },
    `Performance Tracker · ${metric} trend · ${months[0]}–${months[months.length - 1]}`,
  );
}

// ---------------------------------------------------------------------------
// Optimization snapshot — runs the actual Python solver fresh (no "latest
// run" lookup exists or is needed; SupplierScenarioTest.tsx already calls it
// live the same way). An empty body runs the built-in demo scenario, exactly
// as optimizationRouter's own POST /optimization/run does when no custom
// sku_data/resource_limits are supplied — isDemoData mirrors that route's own
// flag so the deck can carry the same "ILLUSTRATIVE / DEMO DATA" disclosure
// the spec requires (§32) whenever the solver ran on demo inputs rather than
// a user-supplied scenario.
// ---------------------------------------------------------------------------
export interface OptimizationSnapshot {
  result: Record<string, unknown>;
  isDemoData: boolean;
}

export async function getOptimizationSnapshot(
  body: { sku_data?: unknown; resource_limits?: unknown; scenario?: unknown } = {},
): Promise<ToolResult<OptimizationSnapshot>> {
  const usedCustomData = Boolean(body.sku_data || body.resource_limits);
  const outcome: OptimizationOutcome = await runOptimization(body);
  if (!outcome.ok) {
    return err('no_data', outcome.reason === 'invalid_input' ? outcome.message : 'Optimization engine unavailable — could not build this slide.');
  }
  return ok({ result: outcome.result, isDemoData: !usedCustomData }, 'Optimization Lab · production-mix solver output');
}

// ---------------------------------------------------------------------------
// Latest AI Risk research + any linked Supplier Intelligence follow-up.
// Read-only lookups against records that already carry their own real
// external-source attribution and price-classification (Published /
// Indicative / Estimated Landed / Request Quote) — this file does not
// reclassify or reword any of that; a presentation slide built from this
// must reproduce the classification and disclaimer verbatim, never
// upgrading an indicative price into a confirmed quotation (spec §33).
// ---------------------------------------------------------------------------
export interface RiskSnapshot {
  research: ResearchRecord;
  supplierResearch: SupplierResearchRecord[];
}

export function getLatestRiskResearch(material?: string): ToolResult<RiskSnapshot> {
  const all = listResearch(); // already ORDER BY created_at DESC
  const matches = material ? all.filter((r) => r.params.rawMaterial === material) : all;
  if (matches.length === 0) {
    return err('no_data', material ? `No AI Risk research found for "${material}".` : 'No AI Risk research has been run yet.');
  }
  const research = matches[0];
  const supplierResearch = listSupplierResearchForResearchId(research.id);
  return ok(
    { research, supplierResearch },
    `AI Risk Intelligence${material ? ` · ${material}` : ''} · most recent research · ${research.createdAt}`,
  );
}
