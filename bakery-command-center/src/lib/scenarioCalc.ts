// Scenario & Resilience — pure functions only, ported verbatim from the
// Streamlit Scenario & Resilience page (app.py lines 2193-2408). Three real
// formulas exist across its four modules; Pandemic Preparedness has no
// formula of its own (just threshold-based flags on raw slider values, kept
// inline in its component).

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

// --- Module 1: Inflation Sensitivity (app.py lines 2197-2229) --------------

export interface InflationSensitivityInputs {
  /** performanceTracker.baseline.costPerUnit — not duplicated here. */
  baseCost: number;
  /** performanceTracker.baseline.foodCostPct — not duplicated here. */
  baseFoodCostPct: number;
  headlineInflationPct: number;
  foodInflationPct: number;
  subsidyOffsetAed: number;
}

export interface InflationSensitivityResult {
  inflationAddon: number;
  netAfterSubsidy: number;
  adjCostHeadline: number;
  adjCostFood: number;
  baseRevenuePerUnit: number;
  foodCostPctAdj: number;
}

export function computeInflationSensitivity(inputs: InflationSensitivityInputs): InflationSensitivityResult {
  const { baseCost, baseFoodCostPct, headlineInflationPct, foodInflationPct, subsidyOffsetAed } = inputs;

  const inflationAddon = round((baseCost * foodInflationPct) / 100, 3);
  const netAfterSubsidy = round(baseCost + inflationAddon - subsidyOffsetAed, 2);

  const adjCostHeadline = round(baseCost * (1 + headlineInflationPct / 100) - subsidyOffsetAed, 3);
  const adjCostFood = round(baseCost * (1 + foodInflationPct / 100) - subsidyOffsetAed, 3);

  // Assumes revenue per unit stays fixed while cost rises, so the implied
  // food-cost % simply scales with the new cost — exactly the source's
  // simplification, not something added here.
  const baseRevenuePerUnit = baseCost / (baseFoodCostPct / 100);
  const foodCostPctAdj = round((adjCostFood / baseRevenuePerUnit) * 100, 1);

  return { inflationAddon, netAfterSubsidy, adjCostHeadline, adjCostFood, baseRevenuePerUnit, foodCostPctAdj };
}

// --- Module 2: Supply Disruption Risk (app.py lines 2279-2282) ------------

export interface SupplyDisruptionInputs {
  avgDailyCostAed: number;
  delayDays: number;
  stockoutProbability: number;
}

export interface SupplyDisruptionResult {
  bufferStockDays: number;
  bufferStockCost: number;
  expectedStockoutCost: number;
}

/**
 * costPremiumPct is part of each scenario's data (and shown as a stat) but is
 * genuinely unused in this formula in the Streamlit source — reproduced as a
 * no-op here too, not folded in on the assumption it "should" matter.
 */
export function computeSupplyDisruption(inputs: SupplyDisruptionInputs): SupplyDisruptionResult {
  const { avgDailyCostAed, delayDays, stockoutProbability } = inputs;
  const bufferStockDays = Math.max(delayDays, 3);
  const bufferStockCost = Math.round(bufferStockDays * avgDailyCostAed * 0.02);
  const expectedStockoutCost = Math.round(stockoutProbability * avgDailyCostAed * delayDays * 1.5);
  return { bufferStockDays, bufferStockCost, expectedStockoutCost };
}

// --- Module 4: Supplier Alternatives — HHI (app.py lines 2352-2362) -------

export type HhiRiskLabel = 'Low concentration risk' | 'Moderate concentration risk' | 'High concentration risk';

export interface HhiResult {
  hhi: number;
  riskLabel: HhiRiskLabel;
}

/** Normalizes shares to sum to 100 before squaring, exactly as the source does (shares_norm = shares / total * 100). */
export function computeHhi(shares: number[], lowMax: number, moderateMax: number): HhiResult {
  const total = shares.reduce((a, b) => a + b, 0);
  const normalized = total > 0 ? shares.map((s) => (s / total) * 100) : shares;
  const hhi = Math.round(normalized.reduce((sum, s) => sum + s * s, 0));
  const riskLabel: HhiRiskLabel = hhi < lowMax ? 'Low concentration risk' : hhi < moderateMax ? 'Moderate concentration risk' : 'High concentration risk';
  return { hhi, riskLabel };
}
