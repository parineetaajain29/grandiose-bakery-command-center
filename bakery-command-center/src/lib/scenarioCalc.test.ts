import { describe, expect, it } from 'vitest';
import { computeHhi, computeInflationSensitivity, computeSupplyDisruption } from './scenarioCalc';

describe('computeInflationSensitivity — Streamlit Module 1 (app.py lines 2197-2229)', () => {
  it('reproduces the hand-verified example at default slider values', () => {
    const result = computeInflationSensitivity({
      baseCost: 3.85,
      baseFoodCostPct: 31.4,
      headlineInflationPct: 2.8,
      foodInflationPct: 5.3,
      subsidyOffsetAed: 0.05,
    });
    expect(result.inflationAddon).toBeCloseTo(0.204, 10);
    expect(result.netAfterSubsidy).toBeCloseTo(4.0, 10);
    expect(result.adjCostHeadline).toBeCloseTo(3.908, 10);
    expect(result.adjCostFood).toBeCloseTo(4.004, 10);
    expect(result.baseRevenuePerUnit).toBeCloseTo(12.261146496815288, 10);
    expect(result.foodCostPctAdj).toBeCloseTo(32.7, 10);
  });

  it('a zero subsidy offset means net_after_subsidy is base cost plus the addon, to within each figure\'s own rounding (addon rounds to 3dp, net rounds to 2dp independently, same as the source)', () => {
    const result = computeInflationSensitivity({ baseCost: 3.85, baseFoodCostPct: 31.4, headlineInflationPct: 0, foodInflationPct: 5.3, subsidyOffsetAed: 0 });
    expect(result.netAfterSubsidy).toBeCloseTo(result.inflationAddon + 3.85, 2);
  });
});

describe('computeSupplyDisruption — Streamlit Module 2 (app.py lines 2279-2282)', () => {
  it('reproduces the hand-verified example at the default "Strait chokepoint closure" scenario', () => {
    const result = computeSupplyDisruption({ avgDailyCostAed: 4200, delayDays: 18, stockoutProbability: 0.35 });
    expect(result.bufferStockDays).toBe(18);
    expect(result.bufferStockCost).toBe(1512);
    expect(result.expectedStockoutCost).toBe(39690);
  });

  it('floors buffer stock days at 3 even for a shorter delay', () => {
    const result = computeSupplyDisruption({ avgDailyCostAed: 4200, delayDays: 0, stockoutProbability: 0.02 });
    expect(result.bufferStockDays).toBe(3);
  });
});

describe('computeHhi — Streamlit Module 4 (app.py lines 2352-2362)', () => {
  it('reproduces the hand-verified example at the default supplier spend mix (2370, moderate)', () => {
    const result = computeHhi([31, 28, 12, 20, 9], 1500, 2500);
    expect(result.hhi).toBe(2370);
    expect(result.riskLabel).toBe('Moderate concentration risk');
  });

  it('flags a single-supplier concentration as high risk', () => {
    const result = computeHhi([100, 0, 0, 0, 0], 1500, 2500);
    expect(result.hhi).toBe(10000);
    expect(result.riskLabel).toBe('High concentration risk');
  });

  it('an even five-way split (HHI 2000) is still moderate, not low — 1500 is a real floor even for a diversified mix', () => {
    const result = computeHhi([20, 20, 20, 20, 20], 1500, 2500);
    expect(result.hhi).toBe(2000);
    expect(result.riskLabel).toBe('Moderate concentration risk');
  });

  it('a fully even split needs 7+ equal suppliers to clear the 1500 low-risk threshold', () => {
    const sevenWay = computeHhi(Array(7).fill(1), 1500, 2500); // HHI = 7 * (100/7)^2 ≈ 1428.6 -> 1429
    expect(sevenWay.hhi).toBeLessThan(1500);
    expect(sevenWay.riskLabel).toBe('Low concentration risk');
  });

  it('normalizes shares that do not sum to 100 before squaring', () => {
    const scaled = computeHhi([62, 56, 24, 40, 18], 1500, 2500); // same ratios as the default mix, doubled
    expect(scaled.hhi).toBe(2370);
  });
});
