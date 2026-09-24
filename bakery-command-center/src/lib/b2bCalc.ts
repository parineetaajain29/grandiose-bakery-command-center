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

// Widened for the Client list tab's fuller column set (Phase D follow-up) —
// every added key is a real B2BClient field already in use elsewhere on the
// page (ReceivablesByClient, OtifRankedBar, the Excel export), just not
// previously exposed as a sortable table column. The comparison itself
// (a[key] - b[key]) is unchanged for every pre-existing key.
export type ClientSortKey =
  | 'name'
  | 'revenue'
  | 'marginPct'
  | 'marginalMarginPct'
  | 'otifPct'
  | 'serviceCost'
  | 'onTimeCount'
  | 'totalDeliveries'
  | 'paymentTermsDays'
  | 'receivableAmount'
  | 'daysOutstanding';
export type SortDirection = 'asc' | 'desc';

export function sortClients<
  T extends {
    name: string;
    revenue: number;
    marginPct: number;
    marginalMarginPct: number;
    otifPct: number;
    serviceCost: number;
    onTimeCount: number;
    totalDeliveries: number;
    paymentTermsDays: number;
    receivableAmount: number;
    daysOutstanding: number;
  },
>(clients: T[], key: ClientSortKey, direction: SortDirection = 'desc'): T[] {
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

// --- Orders tab (Phase D follow-up) — b2b.recentDeliveries is the entire
// real delivery dataset (8 records, no date field, no larger history behind
// it), so these are deliberately small, matching filterClients/sortClients'
// own shape rather than inventing a heavier order model.

export type DeliverySortKey = 'time' | 'value';

/** `time` is a zero-padded "HH:MM" string (confirmed against all 8 real
 * records), so a plain lexicographic compare sorts it correctly by clock time. */
export function sortDeliveries<T extends { time: string; value: number }>(
  deliveries: T[],
  key: DeliverySortKey,
  direction: SortDirection = 'desc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...deliveries].sort((a, b) => {
    if (key === 'time') return sign * a.time.localeCompare(b.time);
    return sign * (a.value - b.value);
  });
}

/** Case-insensitive substring match on delivery client or location. */
export function filterDeliveries<T extends { client: string; location: string }>(deliveries: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === '') return deliveries;
  return deliveries.filter((d) => d.client.toLowerCase().includes(q) || d.location.toLowerCase().includes(q));
}

// --- Company-wide aggregates, all derived live from the client list ---------
// Ported from Streamlit's b2b_calc.py (otif_rate_pct, late_count,
// weighted_avg_days, aging_buckets, total_outstanding, past_60_days_total) —
// the source's own explicit design principle: these are "computed FROM this
// list, not hardcoded separately, so the two can never drift apart." Phase 6
// of the migration found the localhost B2B page violating that principle for
// every one of these except revenue (a flat netMarginPct, otifPct/
// otifLateCount, and collectionDays were each stored independently of the
// per-client figures the Account Profitability table already showed — one of
// them, net margin, had drifted to roughly double what the client list
// actually implies). These functions close that gap.

/** null when totalDeliveries is 0. */
export function otifRatePct(onTimeCount: number, totalDeliveries: number): number | null {
  if (totalDeliveries === 0) return null;
  return (onTimeCount / totalDeliveries) * 100;
}

export function lateDeliveryCount(totalDeliveries: number, onTimeCount: number): number {
  return totalDeliveries - onTimeCount;
}

/** Weighted mean of days-outstanding, weighted by amount. null when the total amount is 0 or the list is empty. */
export function weightedAvgDays(receivables: { amount: number; days: number }[]): number | null {
  const totalAmount = receivables.reduce((sum, r) => sum + r.amount, 0);
  if (receivables.length === 0 || totalAmount === 0) return null;
  return receivables.reduce((sum, r) => sum + r.amount * r.days, 0) / totalAmount;
}

/** Buckets (amount, daysOutstanding) pairs into 0-30/31-60/61-90/90+, same edges as the source. */
export function agingBuckets(receivables: { amount: number; days: number }[]): [number, number, number, number] {
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  for (const { amount, days } of receivables) {
    if (days <= 30) buckets[0] += amount;
    else if (days <= 60) buckets[1] += amount;
    else if (days <= 90) buckets[2] += amount;
    else buckets[3] += amount;
  }
  return buckets;
}

export function totalOutstanding(receivables: { amount: number; days: number }[]): number {
  return receivables.reduce((sum, r) => sum + r.amount, 0);
}

/** Amount in the 61-90 and 90+ buckets combined. */
export function past60DaysTotal(receivables: { amount: number; days: number }[]): number {
  return receivables.filter((r) => r.days > 60).reduce((sum, r) => sum + r.amount, 0);
}

export interface B2BSummaryInput {
  name: string;
  revenue: number;
  serviceCost: number;
  onTimeCount: number;
  totalDeliveries: number;
  receivableAmount: number;
  daysOutstanding: number;
}

export interface DerivedB2BSummary {
  revenue: number;
  netMarginPct: number | null;
  otifPct: number | null;
  otifLateCount: number;
  collectionDays: number | null;
}

/**
 * Company-wide revenue, net margin, OTIF, and average collection days — every
 * one computed from the client list itself, matching Streamlit's company_margin_pct/
 * otif_pct/avg_collection_days derivation (app.py's b2b_performance section).
 */
export function deriveB2BSummary(clients: B2BSummaryInput[]): DerivedB2BSummary {
  const revenue = clients.reduce((sum, c) => sum + c.revenue, 0);
  const totalServiceCost = clients.reduce((sum, c) => sum + c.serviceCost, 0);
  const totalOnTime = clients.reduce((sum, c) => sum + c.onTimeCount, 0);
  const totalDeliveries = clients.reduce((sum, c) => sum + c.totalDeliveries, 0);
  const receivables = clients.map((c) => ({ amount: c.receivableAmount, days: c.daysOutstanding }));

  return {
    revenue,
    netMarginPct: revenue === 0 ? null : ((revenue - totalServiceCost) / revenue) * 100,
    otifPct: otifRatePct(totalOnTime, totalDeliveries),
    otifLateCount: lateDeliveryCount(totalDeliveries, totalOnTime),
    collectionDays: weightedAvgDays(receivables),
  };
}

export function deriveReceivables(clients: { receivableAmount: number; daysOutstanding: number }[]): { total: number; past60: number; buckets: [number, number, number, number] } {
  const receivables = clients.map((c) => ({ amount: c.receivableAmount, days: c.daysOutstanding }));
  return {
    total: totalOutstanding(receivables),
    past60: past60DaysTotal(receivables),
    buckets: agingBuckets(receivables),
  };
}
