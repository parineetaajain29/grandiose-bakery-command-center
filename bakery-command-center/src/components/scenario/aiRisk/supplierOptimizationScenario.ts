// Deterministic (no LLM math — Rule 2, same as aiRisk.ts) bridge between a
// selected Supplier Intelligence row and the existing Python optimizer's
// `scenario` override mechanism. See src/data/api.ts's OptimizationScenario
// for the override shape itself, which already exists in
// optimization_engine.py and is untouched by this file.
//
// The optimizer only models 4 resources (labour_minutes, oven_minutes,
// flour_kg, butter_kg) — of every raw material Supplier Intelligence can
// search for, only butter and flour map to a real, optimizer-modeled
// resource. mapMaterialToResource() is deliberately conservative: it only
// matches "butter" and "flour"/"wheat", not broader dairy/grain terms like
// "milk", "cream", or "cheese" — those aren't actually the same resource the
// optimizer tracks, and claiming otherwise would misrepresent what the test
// is actually modeling.
//
// There is no baseline ingredient cost-per-kg anywhere in this app (checked
// across scenarios.json and src/lib/*.ts) — the SKU model only carries one
// blended variable_cost per SKU. "Current cost/kg" is therefore always a
// management-entered assumption in the review screen, never something this
// file invents or looks up.
import type { OptimizationResourceName, OptimizationScenario, OptimizationSkuInput } from '../../../data/api';

export type OptimizerMappedResource = Extract<OptimizationResourceName, 'flour_kg' | 'butter_kg'>;

export function mapMaterialToResource(material: string): OptimizerMappedResource | null {
  const lower = material.toLowerCase();
  if (lower.includes('butter')) return 'butter_kg';
  if (lower.includes('flour') || lower.includes('wheat')) return 'flour_kg';
  return null;
}

/** Exact mirror of optimization_engine.py's DEMO_SKU_DATA and
 * DEMO_RESOURCE_LIMITS (illustrative demo data only, never real Grandiose
 * data — same status as every other demo figure already in this app). A
 * `scenario`-only request to /api/optimization/run falls back to this exact
 * baseline server-side (see optimization_cli.py), so the review screen's
 * "current availability" and the per-SKU rates used for the cost-delta
 * calculation below must match it exactly, not approximate it. */
export const DEMO_RESOURCE_LIMITS: Record<OptimizerMappedResource, number> = {
  flour_kg: 256.25,
  butter_kg: 93.6,
};

const DEMO_SKU_RATES: { sku: string; variable_cost: number; flour_kg: number; butter_kg: number }[] = [
  { sku: 'Croissant', variable_cost: 3.2, flour_kg: 0.08, butter_kg: 0.03 },
  { sku: 'Pain au Chocolat', variable_cost: 3.8, flour_kg: 0.085, butter_kg: 0.032 },
  { sku: 'Danish', variable_cost: 4.6, flour_kg: 0.09, butter_kg: 0.035 },
  { sku: 'Brioche', variable_cost: 2.9, flour_kg: 0.075, butter_kg: 0.025 },
  { sku: 'Cinnamon Roll', variable_cost: 3.4, flour_kg: 0.08, butter_kg: 0.028 },
];

export interface SupplierScenarioAssumptions {
  resource: OptimizerMappedResource;
  additionalAvailabilityKg: number;
  currentCostPerKg: number;
  supplierCostPerKg: number;
}

/** Builds the OptimizationScenario override for a confirmed set of
 * management assumptions. Pure arithmetic: resource_overrides sets the new
 * total availability; sku_overrides patches variable_cost only for SKUs that
 * actually consume this resource (never a blanket multiplier across
 * unrelated SKUs), by the exact per-unit rate × the cost-per-kg delta the
 * supplier implies. */
export function buildSupplierScenario(a: SupplierScenarioAssumptions): OptimizationScenario {
  const costDeltaPerKg = a.supplierCostPerKg - a.currentCostPerKg;
  const skuOverrides: Record<string, Partial<OptimizationSkuInput>> = {};

  for (const row of DEMO_SKU_RATES) {
    const ratePerUnit = row[a.resource];
    if (ratePerUnit <= 0) continue;
    const newVariableCost = Math.round((row.variable_cost + ratePerUnit * costDeltaPerKg) * 10_000) / 10_000;
    skuOverrides[row.sku] = { variable_cost: Math.max(newVariableCost, 0) };
  }

  return {
    name: `Supplier scenario — ${a.resource}`,
    resource_overrides: { [a.resource]: DEMO_RESOURCE_LIMITS[a.resource] + a.additionalAvailabilityKg },
    sku_overrides: skuOverrides,
  };
}
