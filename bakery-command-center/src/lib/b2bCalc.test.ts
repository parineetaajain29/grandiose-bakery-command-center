import { describe, expect, it } from 'vitest';
import {
  computeAccountMarginPct,
  computeConcentration,
  computeMarginalContribution,
  computeMarginalMarginPct,
  computePastDuePct,
  computeWeeklyMargins,
  filterClients,
  sortClients,
} from './b2bCalc';

describe('computeWeeklyMargins', () => {
  it('computes the revenue-minus-cost gap the hero chart subtitle refers to', () => {
    const [w1, w2] = computeWeeklyMargins([
      { week: 1, revenue: 24100, serviceCost: 3980 },
      { week: 2, revenue: 0, serviceCost: 0 },
    ]);
    expect(w1.margin).toBe(20120);
    expect(w1.marginPct).toBeCloseTo((20120 / 24100) * 100, 10);
    expect(w2.marginPct).toBeNull(); // revenue 0 guard
  });
});

describe('computeAccountMarginPct — full absorption', () => {
  it('can go negative when service cost exceeds revenue', () => {
    // Mirrors the Sunrise Corporate Dining placeholder: revenue-positive, margin-negative.
    expect(computeAccountMarginPct(30000, 34000)).toBeCloseTo(-13.333333333333334, 10);
  });

  it('returns null instead of dividing by zero revenue', () => {
    expect(computeAccountMarginPct(0, 500)).toBeNull();
  });
});

describe('marginal contribution — brief §B2 formula', () => {
  const idleOrder = { orderValue: 1200, ingredientCost: 380, packagingCost: 60, deliveryCost: 140, incrementalLabourCost: 0, overtimePremium: 0 };
  const overtimeOrder = { ...idleOrder, incrementalLabourCost: 90, overtimePremium: 210 };

  it('idle capacity absorbs the order at a higher marginal margin than an overtime slot', () => {
    expect(computeMarginalContribution(idleOrder)).toBe(620);
    expect(computeMarginalMarginPct(idleOrder)).toBeCloseTo((620 / 1200) * 100, 10);

    expect(computeMarginalContribution(overtimeOrder)).toBe(320);
    expect(computeMarginalMarginPct(overtimeOrder)).toBeCloseTo((320 / 1200) * 100, 10);

    expect(computeMarginalMarginPct(overtimeOrder)!).toBeLessThan(computeMarginalMarginPct(idleOrder)!);
  });

  it('returns null instead of dividing by zero order value', () => {
    expect(computeMarginalMarginPct({ ...idleOrder, orderValue: 0 })).toBeNull();
  });
});

describe('computeConcentration — top-2 account risk', () => {
  const clients = [
    { name: 'Al Manzil Hotels', revenue: 132000 },
    { name: 'Costa Grand Hotel Group', revenue: 68000 },
    { name: 'Nour Cafe Chain', revenue: 58000 },
  ];

  it('sorts by revenue and computes top-account and top-two share', () => {
    const result = computeConcentration(clients);
    expect(result.topAccountName).toBe('Al Manzil Hotels');
    expect(result.topAccountPct).toBeCloseTo((132000 / 258000) * 100, 10);
    expect(result.topTwoPct).toBeCloseTo((200000 / 258000) * 100, 10);
    expect(result.segments[0].name).toBe('Al Manzil Hotels');
  });

  it('handles an empty client list without dividing by zero', () => {
    const result = computeConcentration([]);
    expect(result.topAccountName).toBeNull();
    expect(result.topTwoPct).toBeNull();
    expect(result.segments).toEqual([]);
  });
});

describe('computePastDuePct', () => {
  it('computes the past-60-days share of receivables', () => {
    expect(computePastDuePct(187000, 41000)).toBeCloseTo((41000 / 187000) * 100, 10);
  });

  it('returns null instead of dividing by zero total', () => {
    expect(computePastDuePct(0, 0)).toBeNull();
  });
});

describe('sortClients and filterClients', () => {
  const rows = [
    { name: 'Al Manzil Hotels', location: 'Deira', revenue: 132000, marginPct: 53.3, marginalMarginPct: 80.4, otifPct: 99.1 },
    { name: 'Sunrise Corporate Dining', location: 'DIFC', revenue: 30000, marginPct: -13.3, marginalMarginPct: 52.4, otifPct: 85.6 },
  ];

  it('sorts descending by revenue by default', () => {
    const sorted = sortClients(rows, 'revenue');
    expect(sorted.map((r) => r.name)).toEqual(['Al Manzil Hotels', 'Sunrise Corporate Dining']);
  });

  it('sorts ascending when asked', () => {
    const sorted = sortClients(rows, 'marginPct', 'asc');
    expect(sorted[0].name).toBe('Sunrise Corporate Dining');
  });

  it('filters by name or location, case-insensitively, without mutating input order', () => {
    expect(filterClients(rows, 'difc').map((r) => r.name)).toEqual(['Sunrise Corporate Dining']);
    expect(filterClients(rows, 'manzil').map((r) => r.name)).toEqual(['Al Manzil Hotels']);
    expect(filterClients(rows, '')).toEqual(rows);
  });
});
