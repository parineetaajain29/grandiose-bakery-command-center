import { describe, expect, it } from 'vitest';
import { costStructureRemainder, projectFoodCostTrend } from './performanceCalc';

describe('costStructureRemainder — Streamlit cost_values[4] (app.py line 2107)', () => {
  it('matches the hand-verified Performance Tracker baseline: 100 - 31.4 - 20.0 - 2.1 - 9.4 = 37.1', () => {
    expect(costStructureRemainder({ foodCostPct: 31.4, labourTargetPct: 20.0, packagingPct: 2.1, overheadPct: 9.4 })).toBeCloseTo(37.1, 10);
  });

  it('clamps at zero rather than going negative', () => {
    expect(costStructureRemainder({ foodCostPct: 60, labourTargetPct: 30, packagingPct: 10, overheadPct: 10 })).toBe(0);
  });
});

describe('projectFoodCostTrend — Streamlit "Projected (+2 months)" toggle (app.py lines 2141-2148)', () => {
  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const trend = [29.8, 30.1, 30.6, 30.9, 31.0, 31.4];
  const target = [30.0, 30.0, 30.0, 30.0, 30.0, 30.0];

  it('reproduces the hand-verified projection: slope 0.4, projected [31.8, 32.2]', () => {
    const result = projectFoodCostTrend(months, trend, target);
    expect(result.months).toEqual(['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug*', 'Sep*']);
    expect(result.trend).toEqual([29.8, 30.1, 30.6, 30.9, 31.0, 31.4, 31.8, 32.2]);
    expect(result.historicalCount).toBe(6);
  });

  it('extends the target line flat rather than projecting it', () => {
    const result = projectFoodCostTrend(months, trend, target);
    expect(result.target).toEqual([30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0, 30.0]);
  });

  it('uses only the last two historical points — a flatter or steeper earlier trend does not change the slope', () => {
    const flatEarly = [31.0, 31.0, 31.0, 31.0, 31.0, 31.4];
    const result = projectFoodCostTrend(months, flatEarly, target);
    // slope = 31.4 - 31.0 = 0.4, same as the main case, regardless of the earlier points.
    expect(result.trend.slice(-2)).toEqual([31.8, 32.2]);
  });
});
