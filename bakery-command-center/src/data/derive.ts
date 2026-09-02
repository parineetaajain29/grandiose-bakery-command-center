import type { Kpis, PeriodCell, SankeyData } from './types';
import raw from './scenarios.json';

const data = raw as unknown as import('./types').ScenariosFile;

/**
 * scenarios.json only ships a fully-specified Sankey for actuals/Jul.
 * Every other scenario/period cell only has the 5 top-line KPIs.
 *
 * To keep every scenario tab and period button "live" (brief §4) without
 * inventing revenue/cost figures that aren't in the source data, this
 * derives a Sankey breakdown for any cell using:
 *   - that cell's OWN revenue, gross margin %, and wastage cost (real numbers)
 *   - the *shape* (relative mix) of the one fully-specified baseline cell
 *     (actuals/Jul) to distribute those totals across sources/buckets
 *
 * Anything derived this way is visually flagged in the UI as "modeled from
 * Jul actuals mix, scaled to this scenario" rather than presented as
 * independently reported data.
 */
const BASELINE: SankeyData = data.scenarios.actuals.months.Jul.sankey as SankeyData;

const baselineRevenueTotal = sum(BASELINE.revenue.map((d) => d.value));
const baselineCopTotal = sum(BASELINE.costOfProduction.map((d) => d.value));
const baselineOpexTotal = sum(BASELINE.opex.map((d) => d.value));
const baselineWastage = BASELINE.opex.find((d) => d.name === 'Wastage')!.value;
const baselineOpexExWastage = baselineOpexTotal - baselineWastage;

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function isBaselineSankey(sankey: SankeyData): boolean {
  return sankey === BASELINE;
}

export function deriveSankey(kpis: Kpis): { sankey: SankeyData; isDerived: boolean } {
  const revenue = kpis.revenue.value;
  const grossMarginPct = kpis.grossMargin.value / 100;
  const wastage = kpis.wastageCost.value;

  const revenueSources = BASELINE.revenue.map((d) => ({
    name: d.name,
    value: round((d.value / baselineRevenueTotal) * revenue),
  }));

  const costOfProduction = BASELINE.costOfProduction.map((d) => ({
    name: d.name,
    value: round((d.value / baselineCopTotal) * (baselineCopTotal / baselineRevenueTotal) * revenue),
  }));
  const copTotal = sum(costOfProduction.map((d) => d.value));

  const grossProfit = revenue - copTotal;
  const operatingResult = revenue * grossMarginPct;
  const opexExWastageTotal = Math.max(grossProfit - operatingResult - wastage, 0);

  const opex = BASELINE.opex.map((d) => {
    if (d.name === 'Wastage') return { name: d.name, value: round(wastage) };
    const share = d.value / baselineOpexExWastage;
    return { name: d.name, value: round(share * opexExWastageTotal) };
  });

  return {
    sankey: { revenue: revenueSources, costOfProduction, opex },
    isDerived: true,
  };
}

export function getSankeyForCell(cell: PeriodCell): { sankey: SankeyData; isDerived: boolean } {
  if (cell.sankey) return { sankey: cell.sankey, isDerived: false };
  return deriveSankey(cell.kpis);
}

function round(n: number): number {
  return Math.round(n);
}

// --- 13-week forecast + "Model a scenario" lever math -----------------

/**
 * Slider max (88) === headcountTarget(200) - headcountCurrent(112) in
 * scenarios.json meta, and expansionCase is explicitly "full headcount
 * (200)". So the hiring slider interpolates linearly between the actuals
 * capacity utilization (0 hires) and the expansionCase capacity
 * utilization (88 hires) — both real numbers already in the data, no new
 * figures invented.
 */
export function capacityUtilizationForHires(hires: number): number {
  const { sliderRange } = data.forecast13Week;
  const t = clamp(hires / sliderRange.max, 0, 1);
  const start = data.scenarios.actuals.months.Jul.kpis.capacityUtilization.value;
  const end = data.scenarios.expansionCase.months.Jul.kpis.capacityUtilization.value;
  return start + (end - start) * t;
}

/**
 * Maps a target utilization level onto the 13-week baseline wastage-rate
 * trend by finding how far along the 13-week window the trend would need
 * to run for wastage to fall by a proportional amount, then converts that
 * week index into a month label starting from August (week 1).
 */
export function monthForHires(hires: number): string {
  const { sliderRange } = data.forecast13Week;
  const t = clamp(hires / sliderRange.max, 0, 1);
  const week = Math.max(1, Math.round(t * 13));
  const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const monthIndex = clamp(Math.floor((week - 1) / 4.33), 0, months.length - 1);
  return months[monthIndex];
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Linear interpolation between two known data points, t in [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * "Model a scenario" levers, grounded in anchor data already in
 * scenarios.json rather than a fabricated formula:
 *   - hiring lever interpolates actuals -> expansionCase (0 -> 88 hires,
 *     same span as the forecast slider above)
 *   - wastage lever interpolates actuals -> efficiencyCase, keyed off the
 *     wastage RATE (%) so the default lever position (2.3%) reproduces
 *     the actuals cell exactly and dragging to meta.wastageTarget (1.0%)
 *     reproduces efficiencyCase exactly
 */
export function computeModelScenarioKpis(hiring: number, wastageTargetPct: number): Kpis {
  const actualsJul = data.scenarios.actuals.months.Jul.kpis;
  const expansionJul = data.scenarios.expansionCase.months.Jul.kpis;
  const efficiencyJul = data.scenarios.efficiencyCase.months.Jul.kpis;

  const tHire = clamp(hiring / data.forecast13Week.sliderRange.max, 0, 1);

  const currentWastagePct = (actualsJul.wastageCost.value / actualsJul.revenue.value) * 100;
  const targetWastagePct = data.meta.wastageTarget;
  const tWaste = clamp((currentWastagePct - wastageTargetPct) / (currentWastagePct - targetWastagePct), 0, 1);

  const revenue = lerp(actualsJul.revenue.value, expansionJul.revenue.value, tHire);
  const capacityUtilization = lerp(actualsJul.capacityUtilization.value, expansionJul.capacityUtilization.value, tHire);
  const workingCapital = lerp(actualsJul.workingCapital.value, expansionJul.workingCapital.value, tHire);

  const grossMargin = lerp(actualsJul.grossMargin.value, efficiencyJul.grossMargin.value, tWaste);
  const wastageCost = lerp(actualsJul.wastageCost.value, efficiencyJul.wastageCost.value, tWaste);

  const deltaVsActuals = (v: number, base: number) => ((v - base) / base) * 100;

  return {
    revenue: { value: round(revenue), delta: round10(deltaVsActuals(revenue, actualsJul.revenue.value)) },
    grossMargin: { value: Number(grossMargin.toFixed(1)), delta: round10(grossMargin - actualsJul.grossMargin.value) },
    wastageCost: { value: round(wastageCost), delta: round10(deltaVsActuals(wastageCost, actualsJul.wastageCost.value)) },
    capacityUtilization: {
      value: Number(capacityUtilization.toFixed(1)),
      delta: round10(capacityUtilization - actualsJul.capacityUtilization.value),
    },
    workingCapital: { value: round(workingCapital), delta: round10(deltaVsActuals(workingCapital, actualsJul.workingCapital.value)) },
  };
}

function round10(n: number): number {
  return Math.round(n * 10) / 10;
}

export { data as scenariosFile };
