// SKU / product performance — pure functions only, ported verbatim from
// Streamlit's sku_data.py (load_products, division_summary, kpis, kpi_cards,
// format_aed, format_units) and the bubble-radius formula from app.py
// (_bubble_radius, lines 1863-1867).
import { DIVISIONS, PRIOR_PERIOD, RAW_PRODUCTS, SEASONAL_AVAILABILITY, SEASONAL_COLLECTION, SEASONAL_DIVISION, type Division, type RawProduct } from '../data/skuData';

export interface Sku extends RawProduct {
  /** 1 = best seller by sales value, across the whole catalogue. */
  rank: number;
  /** This SKU's share of total bakery sales, 1 decimal. */
  contributionPct: number;
  collection?: string;
  availability?: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Adds rank and contributionPct — derived here, same as sku_data.py's load_products(), so an upstream source wouldn't need to supply them either. */
export function loadProducts(raw: RawProduct[] = RAW_PRODUCTS): Sku[] {
  const totalSales = raw.reduce((sum, p) => sum + p.salesAed, 0) || 1;
  // Array.prototype.sort is stable (ES2019+), matching Python's sorted() — ties keep their original catalogue order.
  const ranked = [...raw].sort((a, b) => b.salesAed - a.salesAed);
  const rankBySku = new Map(ranked.map((p, i) => [p.sku, i + 1]));

  return raw.map((p) => {
    const sku: Sku = { ...p, rank: rankBySku.get(p.sku)!, contributionPct: round1((p.salesAed / totalSales) * 100) };
    if (p.division === SEASONAL_DIVISION) {
      sku.collection = SEASONAL_COLLECTION;
      sku.availability = SEASONAL_AVAILABILITY;
    }
    return sku;
  });
}

export interface DivisionSummaryRow {
  division: Division;
  skuCount: number;
  units: number;
  salesAed: number;
}

/** Per-division totals, in DIVISIONS order. Divisions with no SKUs are skipped. */
export function divisionSummary(products: Sku[]): DivisionSummaryRow[] {
  const summary: DivisionSummaryRow[] = [];
  for (const division of DIVISIONS) {
    const items = products.filter((p) => p.division === division);
    if (items.length === 0) continue;
    summary.push({
      division,
      skuCount: items.length,
      units: items.reduce((s, p) => s + p.units, 0),
      salesAed: items.reduce((s, p) => s + p.salesAed, 0),
    });
  }
  return summary;
}

export interface SkuKpis {
  totalSales: number;
  totalUnits: number;
  activeSkus: number;
  topDivision: string;
  topProduct: string;
  topDivisionSales: number;
  topProductSales: number;
}

/** The five headline figures, all derived — nothing hard-coded, same as the source's own comment on this function. */
export function computeSkuKpis(products: Sku[]): SkuKpis {
  if (products.length === 0) {
    return { totalSales: 0, totalUnits: 0, activeSkus: 0, topDivision: '—', topProduct: '—', topDivisionSales: 0, topProductSales: 0 };
  }
  const byDivision = divisionSummary(products);
  const topDivision = byDivision.reduce((a, b) => (b.salesAed > a.salesAed ? b : a));
  const topProduct = products.reduce((a, b) => (b.salesAed > a.salesAed ? b : a));
  return {
    totalSales: products.reduce((s, p) => s + p.salesAed, 0),
    totalUnits: products.reduce((s, p) => s + p.units, 0),
    activeSkus: products.length,
    topDivision: topDivision.division,
    topProduct: topProduct.product,
    topDivisionSales: topDivision.salesAed,
    topProductSales: topProduct.salesAed,
  };
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export interface SkuKpiCard {
  label: string;
  value: string;
  sub: string;
  trend: 'up' | 'down' | null;
  accent?: boolean;
}

/**
 * The KPI strip as data. Trend lines for the three numeric KPIs are computed
 * against PRIOR_PERIOD; the two categorical KPIs (top division/product) get a
 * derived context line instead of a fabricated trend — same reasoning as the
 * source: "last month's top product" isn't a percentage change.
 */
export function skuKpiCards(products: Sku[]): SkuKpiCard[] {
  const k = computeSkuKpis(products);
  const total = k.totalSales || 1;

  const salesDelta = pctChange(k.totalSales, PRIOR_PERIOD.totalSales);
  const unitsDelta = pctChange(k.totalUnits, PRIOR_PERIOD.totalUnits);
  const skuDelta = k.activeSkus - PRIOR_PERIOD.activeSkus;

  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs last month`;

  return [
    {
      label: 'Total sales',
      value: formatSkuAed(k.totalSales),
      sub: salesDelta !== null ? signed(salesDelta) : '',
      trend: (salesDelta ?? 0) >= 0 ? 'up' : 'down',
    },
    {
      label: 'Units sold',
      value: formatSkuUnits(k.totalUnits),
      sub: unitsDelta !== null ? signed(unitsDelta) : '',
      trend: (unitsDelta ?? 0) >= 0 ? 'up' : 'down',
    },
    {
      label: 'Active SKUs',
      value: `${k.activeSkus}`,
      sub: skuDelta !== 0 ? `${skuDelta >= 0 ? '+' : ''}${skuDelta} vs last month` : 'unchanged vs last month',
      trend: skuDelta > 0 ? 'up' : skuDelta < 0 ? 'down' : null,
    },
    {
      label: 'Top division',
      value: k.topDivision,
      sub: `${formatSkuAed(k.topDivisionSales)} · ${((k.topDivisionSales / total) * 100).toFixed(0)}% of sales`,
      trend: null,
      accent: true,
    },
    {
      label: 'Top product',
      value: k.topProduct,
      sub: `Rank #1 · ${((k.topProductSales / total) * 100).toFixed(1)}% of sales`,
      trend: null,
    },
  ];
}

/** "AED 2,840,000" -> "AED 2.84M". Lowercase "k" for thousands — matches sku_data.py's format_aed exactly; the app-wide formatAED in lib/format.ts uses uppercase "K" for a different context and is deliberately not reused here. */
export function formatSkuAed(value: number): string {
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `AED ${(value / 1_000).toFixed(0)}k`;
  return `AED ${value.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
}

/** "156,400" -> "156.4K". Uppercase "K" here vs. lowercase "k" in formatSkuAed — an inconsistency already present between the two formatters in sku_data.py, reproduced rather than "fixed". */
export function formatSkuUnits(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('en-AE');
}

export const BUBBLE_R_MIN = 6.5;
export const BUBBLE_R_MAX = 36.0;

/** Radius for a bubble, scaled so AREA (not radius) tracks units sold — app.py's _bubble_radius, lines 1863-1867. */
export function bubbleRadius(units: number, maxUnits: number): number {
  if (maxUnits <= 0) return BUBBLE_R_MIN;
  return BUBBLE_R_MIN + (BUBBLE_R_MAX - BUBBLE_R_MIN) * Math.sqrt(units / maxUnits);
}
