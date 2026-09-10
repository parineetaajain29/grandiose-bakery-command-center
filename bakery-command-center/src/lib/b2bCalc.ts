// B2B client performance — pure functions only. Brief §B2.
//
// Components format and render; they must not compute (§B4) — every number shown
// on the B2B page (margin gap, marginal contribution, concentration share, aging
// totals) is derived here from raw scenarios.json figures.

export interface WeeklyTrendPoint {
  week: number;
  revenue: number;
  serviceCost: number;
}

export interface WeeklyMarginPoint extends WeeklyTrendPoint {
  /** revenue − serviceCost. The gap the hero chart's subtitle refers to. */
  margin: number;
  /** null when revenue is 0. */
  marginPct: number | null;
}

export function computeWeeklyMargins(trend: WeeklyTrendPoint[]): WeeklyMarginPoint[] {
  return trend.map((point) => {
    const margin = point.revenue - point.serviceCost;
    const marginPct = point.revenue === 0 ? null : (margin / point.revenue) * 100;
    return { ...point, margin, marginPct };
  });
}

/** Full-absorption account margin: (revenue − serviceCost) / revenue × 100. null when revenue is 0. */
export function computeAccountMarginPct(revenue: number, serviceCost: number): number | null {
  if (revenue === 0) return null;
  return ((revenue - serviceCost) / revenue) * 100;
}

export interface MarginalOrderInputs {
  orderValue: number;
  ingredientCost: number;
  packagingCost: number;
  deliveryCost: number;
  /** ~0 if idle capacity absorbs the order. */
  incrementalLabourCost: number;
  /** 0 unless the slot forces overtime. */
  overtimePremium: number;
}

export function computeMarginalContribution(inputs: MarginalOrderInputs): number {
  const { orderValue, ingredientCost, packagingCost, deliveryCost, incrementalLabourCost, overtimePremium } = inputs;
  return orderValue - ingredientCost - packagingCost - deliveryCost - incrementalLabourCost - overtimePremium;
}

/** null when orderValue is 0. */
export function computeMarginalMarginPct(inputs: MarginalOrderInputs): number | null {
  if (inputs.orderValue === 0) return null;
  return (computeMarginalContribution(inputs) / inputs.orderValue) * 100;
}

export interface ConcentrationClient {
  name: string;
  revenue: number;
}

export interface ConcentrationSegment {
  name: string;
  revenue: number;
  pct: number;
}

export interface ConcentrationResult {
  totalRevenue: number;
  topAccountName: string | null;
  topAccountPct: number | null;
  topTwoPct: number | null;
  segments: ConcentrationSegment[];
}

/** Top-2 concentration + a proportional segmented breakdown, sorted largest first. */
export function computeConcentration(clients: ConcentrationClient[]): ConcentrationResult {
  const totalRevenue = clients.reduce((sum, c) => sum + c.revenue, 0);
  const sorted = [...clients].sort((a, b) => b.revenue - a.revenue);

  if (totalRevenue === 0 || sorted.length === 0) {
    return { totalRevenue, topAccountName: null, topAccountPct: null, topTwoPct: null, segments: [] };
  }

  const segments = sorted.map((c) => ({ name: c.name, revenue: c.revenue, pct: (c.revenue / totalRevenue) * 100 }));
  const topTwoRevenue = sorted.slice(0, 2).reduce((sum, c) => sum + c.revenue, 0);

  return {
    totalRevenue,
    topAccountName: sorted[0].name,
    topAccountPct: segments[0].pct,
    topTwoPct: (topTwoRevenue / totalRevenue) * 100,
    segments,
  };
}

/** null when total is 0. */
export function computePastDuePct(total: number, past60: number): number | null {
  if (total === 0) return null;
  return (past60 / total) * 100;
}

export type ClientSortKey = 'name' | 'revenue' | 'marginPct' | 'marginalMarginPct' | 'otifPct';
export type SortDirection = 'asc' | 'desc';

export function sortClients<T extends { name: string; revenue: number; marginPct: number; marginalMarginPct: number; otifPct: number }>(
  clients: T[],
  key: ClientSortKey,
  direction: SortDirection = 'desc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...clients].sort((a, b) => {
    if (key === 'name') return sign * a.name.localeCompare(b.name);
    return sign * (a[key] - b[key]);
  });
}

/** Case-insensitive substring match on client name or location — the search bar has no backend (§B2). */
export function filterClients<T extends { name: string; location: string }>(clients: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return clients;
  return clients.filter((c) => c.name.toLowerCase().includes(q) || c.location.toLowerCase().includes(q));
}
