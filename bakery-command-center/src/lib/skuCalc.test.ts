import { describe, expect, it } from 'vitest';
import { RAW_PRODUCTS, type RawProduct } from '../data/skuData';
import { bubbleRadius, computeSkuKpis, divisionSummary, formatSkuAed, formatSkuUnits, loadProducts, skuKpiCards } from './skuCalc';

describe('loadProducts — derives rank and contributionPct, never accepts them as input', () => {
  const products = loadProducts();

  it('carries all 110 SKUs from the source catalogue, matching sku_data.py\'s own per-division counts', () => {
    expect(products).toHaveLength(110);
    const counts: Record<string, number> = {};
    for (const p of products) counts[p.division] = (counts[p.division] ?? 0) + 1;
    expect(counts).toEqual({ Baklava: 22, 'French Bakery': 26, 'Arabic Bread': 16, Viennoiserie: 20, Tahina: 12, 'Seasonal Collection': 14 });
  });

  it('ranks by sales value across the whole catalogue, 1 = best seller (verified against the real dataset total AED 2,840,000)', () => {
    const top = products.find((p) => p.rank === 1)!;
    expect(top.sku).toBe('BKV-001');
    expect(top.product).toBe('Pistachio Baklava Premium');
    expect(top.contributionPct).toBeCloseTo(5.3, 10); // 150000 / 2840000 * 100
  });

  it('tags Seasonal Collection SKUs with collection/availability, and nothing else', () => {
    const seasonal = products.find((p) => p.sku === 'SEA-M01')!;
    expect(seasonal.collection).toBe('Mango Summer Collection');
    expect(seasonal.availability).toBe('May – Sep 2024');
    const nonSeasonal = products.find((p) => p.sku === 'BKV-001')!;
    expect(nonSeasonal.collection).toBeUndefined();
    expect(nonSeasonal.availability).toBeUndefined();
  });

  it('breaks ties by original catalogue order, same as Python\'s stable sort (BKV-021 and BKV-022 both sell AED 7,000)', () => {
    const bkv21 = products.find((p) => p.sku === 'BKV-021')!;
    const bkv22 = products.find((p) => p.sku === 'BKV-022')!;
    expect(bkv21.salesAed).toBe(bkv22.salesAed);
    expect(bkv21.rank).toBeLessThan(bkv22.rank);
  });
});

describe('divisionSummary — per-division totals, DIVISIONS order (verified against the real dataset)', () => {
  const summary = divisionSummary(loadProducts());

  it('reproduces the hand-verified per-division totals exactly', () => {
    expect(summary).toEqual([
      { division: 'Baklava', skuCount: 22, units: 39700, salesAed: 780000 },
      { division: 'French Bakery', skuCount: 26, units: 59550, salesAed: 690000 },
      { division: 'Arabic Bread', skuCount: 16, units: 42800, salesAed: 340000 },
      { division: 'Viennoiserie', skuCount: 20, units: 35600, salesAed: 430000 },
      { division: 'Tahina', skuCount: 12, units: 18920, salesAed: 220000 },
      { division: 'Seasonal Collection', skuCount: 14, units: 25450, salesAed: 380000 },
    ]);
  });

  it('division totals sum to the company-wide total (2,840,000 AED / 222,020 units) — no double-counting or gaps', () => {
    const totalSales = summary.reduce((s, d) => s + d.salesAed, 0);
    const totalUnits = summary.reduce((s, d) => s + d.units, 0);
    expect(totalSales).toBe(2840000);
    expect(totalUnits).toBe(222020);
  });
});

describe('computeSkuKpis — the five headline figures (verified against the real dataset)', () => {
  it('reproduces the hand-verified totals exactly', () => {
    const kpis = computeSkuKpis(loadProducts());
    expect(kpis).toEqual({
      totalSales: 2840000,
      totalUnits: 222020,
      activeSkus: 110,
      topDivision: 'Baklava',
      topProduct: 'Pistachio Baklava Premium',
      topDivisionSales: 780000,
      topProductSales: 150000,
    });
  });

  it('returns the zero-state rather than dividing by zero when there are no products', () => {
    expect(computeSkuKpis([])).toEqual({ totalSales: 0, totalUnits: 0, activeSkus: 0, topDivision: '—', topProduct: '—', topDivisionSales: 0, topProductSales: 0 });
  });
});

describe('skuKpiCards — KPI strip deltas vs. PRIOR_PERIOD (2,620,000 / 210,400 / 104 — DEMO VALUES per the source)', () => {
  const cards = skuKpiCards(loadProducts());

  it('reproduces the hand-verified delta text exactly', () => {
    expect(cards[0]).toEqual({ label: 'Total sales', value: 'AED 2.84M', sub: '+8.4% vs last month', trend: 'up' });
    expect(cards[1]).toEqual({ label: 'Units sold', value: '222.0K', sub: '+5.5% vs last month', trend: 'up' });
    expect(cards[2]).toEqual({ label: 'Active SKUs', value: '110', sub: '+6 vs last month', trend: 'up' });
    expect(cards[3]).toEqual({ label: 'Top division', value: 'Baklava', sub: 'AED 780k · 27% of sales', trend: null, accent: true });
    expect(cards[4]).toEqual({ label: 'Top product', value: 'Pistachio Baklava Premium', sub: 'Rank #1 · 5.3% of sales', trend: null });
  });

  it('shows "unchanged vs last month" rather than "+0" when the SKU count exactly matches the prior period', () => {
    const flatProducts: RawProduct[] = RAW_PRODUCTS.slice(0, 104);
    const flatCards = skuKpiCards(loadProducts(flatProducts));
    expect(flatCards[2].sub).toBe('unchanged vs last month');
    expect(flatCards[2].trend).toBeNull();
  });
});

describe('formatSkuAed / formatSkuUnits — sku_data.py\'s own formatters (note the "k"/"K" case mismatch between them is in the source, not a bug introduced here)', () => {
  it('formats AED with a lowercase "k" for thousands and "M" for millions', () => {
    expect(formatSkuAed(2840000)).toBe('AED 2.84M');
    expect(formatSkuAed(780000)).toBe('AED 780k');
    expect(formatSkuAed(500)).toBe('AED 500');
  });

  it('formats units with an uppercase "K" for thousands', () => {
    expect(formatSkuUnits(222020)).toBe('222.0K');
    expect(formatSkuUnits(156400)).toBe('156.4K');
    expect(formatSkuUnits(400)).toBe('400');
  });
});

describe('bubbleRadius — app.py\'s _bubble_radius (area, not radius, tracks units sold)', () => {
  it('returns the minimum radius at zero units and the maximum at the largest SKU in the dataset', () => {
    expect(bubbleRadius(0, 8200)).toBe(6.5);
    expect(bubbleRadius(8200, 8200)).toBe(36);
  });

  it('scales by sqrt, not linearly — a quarter of max units is half the extra radius range, not a quarter of it', () => {
    const quarter = bubbleRadius(2050, 8200); // 2050/8200 = 0.25, sqrt(0.25) = 0.5
    expect(quarter).toBeCloseTo(6.5 + (36 - 6.5) * 0.5, 10);
  });

  it('falls back to the minimum radius rather than dividing by zero when maxUnits is zero', () => {
    expect(bubbleRadius(0, 0)).toBe(6.5);
  });
});
