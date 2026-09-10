// Labour economics — pure functions only. Employee Portal §6/§8/§9/§12.
//
// All intermediate values carry full float precision; round only at the point of
// display (see src/lib/format.ts). Never round an intermediate and feed it into the
// next step — the client checks these numbers to the decimal.
//
// One LabourRecord = one daily log row (or the sum of several — see
// aggregateLabourRecords). Time fields are in MINUTES: a daily log is naturally a
// minutes-scale entry ("18 min downtime"), and config values like shiftLengthHours
// are just the form's default prefill now, not baked into this arithmetic — each
// row supplies its own paidMinutes directly, so a half shift or overtime is just a
// different number, not a special case.

export interface LabourConfigInput {
  breaksArePaid: boolean;
}

export interface LabourRecord {
  paidMinutes: number;
  breakMinutes: number;
  changeoverMinutes: number;
  downtimeMinutes: number;
  productiveMinutes: number;
  dailySalaryCost: number;
  revenueAttributed: number;
  /** Count of daily-log rows this record represents — 1 for a single day, summed on aggregation. */
  daysLogged: number;
}

export interface LabourResult {
  paidMinutes: number;
  breakMinutes: number;
  changeoverMinutes: number;
  downtimeMinutes: number;
  availableMinutes: number;
  productiveMinutes: number;
  /** Available time not spent productive and not explicitly changeover/downtime — the residual "Idle / Other" bucket. */
  idleMinutes: number;
  /** availableMinutes / paidMinutes × 100 — how much paid time was available to work at all. */
  utilisationPct: number;
  /** TRUE EFFICIENCY: productiveMinutes / paidMinutes × 100 — management's utilisation metric, reflects losses during paid time. */
  trueEfficiencyPct: number;
  /** PERFORMANCE WHILE WORKING: productiveMinutes / availableMinutes × 100 — execution while actually available; null when availableMinutes <= 0. Protects the employee from being penalised for operational losses outside their control. */
  performanceWhileWorkingPct: number | null;
  /** null (never Infinity/NaN) when productiveMinutes is 0 — render as "—". */
  costPerProductiveHour: number | null;
  /** null when dailySalaryCost is 0. */
  revenuePerLabourDirham: number | null;
  /** null when daysLogged is 0. */
  revenuePerDay: number | null;
  /** Count of daily-log rows rolled into this result — divide any minutes field by this for a per-day average. */
  daysLogged: number;
}

export function computeLabourChain(record: LabourRecord, config: LabourConfigInput): LabourResult {
  const { paidMinutes, breakMinutes, changeoverMinutes, downtimeMinutes, productiveMinutes, dailySalaryCost, revenueAttributed, daysLogged } =
    record;

  const availableMinutes = paidMinutes - (config.breaksArePaid ? 0 : breakMinutes) - changeoverMinutes - downtimeMinutes;
  const idleMinutes = availableMinutes - productiveMinutes;

  const utilisationPct = paidMinutes === 0 ? 0 : (availableMinutes / paidMinutes) * 100;
  const trueEfficiencyPct = paidMinutes === 0 ? 0 : (productiveMinutes / paidMinutes) * 100;
  const performanceWhileWorkingPct = availableMinutes <= 0 ? null : (productiveMinutes / availableMinutes) * 100;

  const costPerProductiveHour = productiveMinutes === 0 ? null : dailySalaryCost / (productiveMinutes / 60);
  const revenuePerLabourDirham = dailySalaryCost === 0 ? null : revenueAttributed / dailySalaryCost;
  const revenuePerDay = daysLogged === 0 ? null : revenueAttributed / daysLogged;

  return {
    paidMinutes,
    breakMinutes,
    changeoverMinutes,
    downtimeMinutes,
    availableMinutes,
    productiveMinutes,
    idleMinutes,
    utilisationPct,
    trueEfficiencyPct,
    performanceWhileWorkingPct,
    costPerProductiveHour,
    revenuePerLabourDirham,
    revenuePerDay,
    daysLogged,
  };
}

/**
 * Sums the extensive (summable) fields of a set of daily records. Every field here
 * is linear in the underlying minutes/cost, so computeLabourChain on the sum equals
 * the department/period-level chain computed on aggregated minutes — never average
 * the individual days' or employees' resulting percentages (§12).
 */
export function aggregateLabourRecords(records: LabourRecord[]): LabourRecord {
  return records.reduce<LabourRecord>(
    (acc, r) => ({
      paidMinutes: acc.paidMinutes + r.paidMinutes,
      breakMinutes: acc.breakMinutes + r.breakMinutes,
      changeoverMinutes: acc.changeoverMinutes + r.changeoverMinutes,
      downtimeMinutes: acc.downtimeMinutes + r.downtimeMinutes,
      productiveMinutes: acc.productiveMinutes + r.productiveMinutes,
      dailySalaryCost: acc.dailySalaryCost + r.dailySalaryCost,
      revenueAttributed: acc.revenueAttributed + r.revenueAttributed,
      daysLogged: acc.daysLogged + r.daysLogged,
    }),
    { paidMinutes: 0, breakMinutes: 0, changeoverMinutes: 0, downtimeMinutes: 0, productiveMinutes: 0, dailySalaryCost: 0, revenueAttributed: 0, daysLogged: 0 },
  );
}

/** Rollup over any set of records (a department, a date range, a whole bakery): aggregate minutes first, then derive the chain once. */
export function computeDepartmentRollup(records: LabourRecord[], config: LabourConfigInput): LabourResult {
  return computeLabourChain(aggregateLabourRecords(records), config);
}

/**
 * Naive mean of each result's trueEfficiencyPct — the WRONG way to aggregate,
 * kept only so callers can show it next to the correct SUM/SUM figure as a
 * concrete demonstration of why individual percentages must never be averaged
 * (§12). null on an empty list.
 */
export function naiveMeanTrueEfficiencyPct(results: LabourResult[]): number | null {
  if (results.length === 0) return null;
  return results.reduce((sum, r) => sum + r.trueEfficiencyPct, 0) / results.length;
}

/** One period's worth of records to roll up, keyed by an opaque period label (e.g. a date or month). */
export interface TrendPeriod {
  period: string;
  records: LabourRecord[];
}

export interface TrendPoint {
  period: string;
  result: LabourResult;
}

/**
 * Rolls up each period independently — never mixes minutes across periods together.
 * Used for the employee-portal comparative analysis (an employee, their department,
 * and the company-wide figure, each as their own trend line over the same periods).
 */
export function computeTrendSeries(periods: TrendPeriod[], config: LabourConfigInput): TrendPoint[] {
  return periods.map(({ period, records }) => ({ period, result: computeDepartmentRollup(records, config) }));
}

/**
 * Revenue attribution for non-production (support) departments — brief §A4.
 * Direct production departments attribute actual output value instead and don't
 * call this; support departments (QC, packing & dispatch, admin, ...) receive an
 * allocated share of division revenue.
 */
export function computeAllocatedRevenue(divisionRevenue: number, allocationWeight: number): number {
  return divisionRevenue * allocationWeight;
}

// --- Daily log validation (Employee Portal §8) ---------------------------
// Shared by the server (authoritative) and the Daily Log form (immediate
// feedback) so the rules can never drift between the two.

export const VALID_SHIFTS = ['Morning', 'Night'] as const;
export type Shift = (typeof VALID_SHIFTS)[number];

const MAX_PAID_MINUTES = 16 * 60; // "unrealistic paid hours" cutoff

export interface DailyLogInput {
  date: string; // YYYY-MM-DD
  shift: string;
  paidMinutes: number;
  breakMinutes: number;
  changeoverMinutes: number;
  downtimeMinutes: number;
  productiveMinutes: number;
  unitsProduced?: number | null;
}

/** Returns a list of human-readable problems; empty means the record is valid. Never silently saves invalid data. */
export function validateDailyLogInput(input: DailyLogInput, config: LabourConfigInput): string[] {
  const errors: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push('Date must be a valid date (YYYY-MM-DD).');
  if (!(VALID_SHIFTS as readonly string[]).includes(input.shift)) {
    errors.push(`Shift must be one of: ${VALID_SHIFTS.join(', ')}.`);
  }

  const numericFields: [string, number][] = [
    ['Paid hours', input.paidMinutes],
    ['Break minutes', input.breakMinutes],
    ['Changeover minutes', input.changeoverMinutes],
    ['Downtime minutes', input.downtimeMinutes],
    ['Productive time', input.productiveMinutes],
  ];
  for (const [label, value] of numericFields) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push(`${label} must be a non-negative number.`);
    }
  }
  if (input.unitsProduced != null && (typeof input.unitsProduced !== 'number' || !Number.isFinite(input.unitsProduced) || input.unitsProduced < 0)) {
    errors.push('Units produced must be a non-negative number.');
  }

  // Don't compound range checks on top of already-invalid numbers.
  if (errors.length > 0) return errors;

  if (input.paidMinutes <= 0) errors.push('Paid hours must be greater than zero.');
  if (input.paidMinutes > MAX_PAID_MINUTES) errors.push('Paid hours looks unrealistic for a single shift (over 16 hours).');

  const availableMinutes =
    input.paidMinutes - (config.breaksArePaid ? 0 : input.breakMinutes) - input.changeoverMinutes - input.downtimeMinutes;
  if (input.productiveMinutes > availableMinutes) {
    errors.push('Productive time cannot exceed available working time (paid time minus breaks, changeover, and downtime).');
  }

  const totalLogged = input.breakMinutes + input.changeoverMinutes + input.downtimeMinutes + input.productiveMinutes;
  if (totalLogged > input.paidMinutes) {
    errors.push('Logged activity exceeds the paid shift duration. Please review your entries.');
  }

  return errors;
}

/** Turns an aggregated total (e.g. result.downtimeMinutes over a date range) into a per-day average. null when nothing was logged. */
export function perDayAverage(total: number, daysLogged: number): number | null {
  return daysLogged === 0 ? null : total / daysLogged;
}

export interface LossBreakdown {
  /** Changeover + downtime — operational/process losses outside the employee's direct control. */
  operationalMinutes: number;
  /** The idle/other residual — the loss most within an employee's own control. */
  controllableMinutes: number;
  /** operationalMinutes / (operationalMinutes + controllableMinutes) × 100. null when both are zero. */
  operationalSharePct: number | null;
}

/**
 * Controllable vs. operational loss split (§9) — derived entirely from fields
 * already captured on the daily log, not a new required input. This is a stated
 * assumption (changeover + downtime = operational, idle/other = controllable),
 * not confirmed Grandiose policy, and should be surfaced as such in the UI.
 * A negative idleMinutes (bad/legacy data) is clamped to 0 here rather than
 * shown as a negative "controllable" loss — the anomaly itself belongs in Data
 * Quality, not folded silently into this ratio.
 */
export function categorizeLoss(result: LabourResult): LossBreakdown {
  const operationalMinutes = result.changeoverMinutes + result.downtimeMinutes;
  const controllableMinutes = Math.max(0, result.idleMinutes);
  const total = operationalMinutes + controllableMinutes;
  return {
    operationalMinutes,
    controllableMinutes,
    operationalSharePct: total === 0 ? null : (operationalMinutes / total) * 100,
  };
}
