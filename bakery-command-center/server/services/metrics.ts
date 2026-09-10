import { db } from '../db.ts';
import type { EmployeeSession } from '../auth.ts';
import { LABOUR_CONFIG } from '../../src/config/labourConfig.ts';
import {
  computeDepartmentRollup,
  computeTrendSeries,
  naiveMeanTrueEfficiencyPct,
  type LabourRecord,
  type LabourResult,
} from '../../src/lib/labourCalc.ts';
import { getDailyLogs, type DailyLogRow } from './dailyLogs.ts';
import { getEmployees } from './employees.ts';

function toLabourRecord(log: DailyLogRow): LabourRecord {
  return {
    paidMinutes: log.paidMinutes,
    breakMinutes: log.breakMinutes,
    changeoverMinutes: log.changeoverMinutes,
    downtimeMinutes: log.downtimeMinutes,
    idleMinutes: log.idleMinutes,
    productiveMinutes: log.productiveMinutes,
    unitsProduced: log.unitsProduced ?? 0,
    dailySalaryCost: log.dailySalaryCost,
    revenueAttributed: log.revenueAttributed,
    daysLogged: 1,
  };
}

function employeeIdsInDepartment(departmentName: string): string[] {
  return db.prepare('SELECT id FROM employees WHERE department = ?').all(departmentName).map((r) => (r as { id: string }).id);
}

export function getEmployeeMetrics(employeeId: string, fromDate: string, toDate: string): LabourResult {
  const logs = getDailyLogs([employeeId], fromDate, toDate);
  return computeDepartmentRollup(logs.map(toLabourRecord), LABOUR_CONFIG);
}

/**
 * True if any daily log in range predates idle-minutes tracking (see
 * TrendPointWithProvenance / server/db.ts's migration comment). Purpose-built for
 * Employee Comparison's categorizeLoss-derived cause hint: True Efficiency itself
 * is unaffected by the idle-formula change, but categorizeLoss reads idleMinutes,
 * and a window spanning the cutover would otherwise present one number blending
 * two different idle definitions with no indication it's doing so.
 */
export function hasLegacyDataInRange(employeeId: string, fromDate: string, toDate: string): boolean {
  return getDailyLogs([employeeId], fromDate, toDate).some((log) => log.productiveSelfReported);
}

export function getDepartmentMetrics(departmentName: string, fromDate: string, toDate: string): LabourResult {
  const ids = employeeIdsInDepartment(departmentName);
  const logs = getDailyLogs(ids, fromDate, toDate);
  return computeDepartmentRollup(logs.map(toLabourRecord), LABOUR_CONFIG);
}

export function getBakeryMetrics(fromDate: string, toDate: string): LabourResult {
  const logs = getDailyLogs('all', fromDate, toDate);
  return computeDepartmentRollup(logs.map(toLabourRecord), LABOUR_CONFIG);
}

/**
 * One trend point plus a provenance flag — deliberately not folded into the pure
 * LabourResult/TrendPoint shape in labourCalc.ts (same reasoning as ComparativeMetrics,
 * DepartmentCauseBreakdown, etc. above: labourCalc.ts stays pure economics, composite
 * wrapper shapes live at the service layer). hasLegacyData is true when ANY daily-log
 * row rolled into this period had productiveSelfReported set — i.e. was saved before
 * idle-minutes tracking existed, so its productive figure was typed directly rather
 * than derived. True Efficiency/Performance While Working themselves are NOT affected
 * (see server/db.ts's migration comment) — this flag is purely about how much to trust
 * an individual point, for the trend chart to render a provenance marker.
 */
export interface TrendPointWithProvenance {
  period: string;
  result: LabourResult;
  hasLegacyData: boolean;
}

export function getEmployeeTrend(employeeId: string, fromDate: string, toDate: string): TrendPointWithProvenance[] {
  return groupByDateAndRollUp(getDailyLogs([employeeId], fromDate, toDate));
}

export function getDepartmentTrend(departmentName: string, fromDate: string, toDate: string): TrendPointWithProvenance[] {
  return groupByDateAndRollUp(getDailyLogs(employeeIdsInDepartment(departmentName), fromDate, toDate));
}

export function getBakeryTrend(fromDate: string, toDate: string): TrendPointWithProvenance[] {
  return groupByDateAndRollUp(getDailyLogs('all', fromDate, toDate));
}

function groupByDateAndRollUp(logs: DailyLogRow[]): TrendPointWithProvenance[] {
  const byDate = new Map<string, DailyLogRow[]>();
  for (const log of logs) {
    const bucket = byDate.get(log.date) ?? [];
    bucket.push(log);
    byDate.set(log.date, bucket);
  }
  const sortedDates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  const periods = sortedDates.map((period) => ({ period, records: byDate.get(period)!.map(toLabourRecord) }));
  const series = computeTrendSeries(periods, LABOUR_CONFIG);

  return series.map((point, i) => ({
    ...point,
    hasLegacyData: byDate.get(sortedDates[i])!.some((log) => log.productiveSelfReported),
  }));
}

/**
 * Correct SUM/SUM department efficiency next to the naive mean of each employee's
 * own percentage, over the same date range — the concrete demonstration for §12.
 * Uses whatever the current dataset actually produces; never fabricated numbers.
 */
export function getDepartmentAggregationComparison(
  departmentName: string,
  fromDate: string,
  toDate: string,
): { correct: LabourResult; naiveMeanTrueEfficiencyPct: number | null; employeeCount: number } {
  const ids = employeeIdsInDepartment(departmentName);
  const employeeResults = ids
    .map((id) => getEmployeeMetrics(id, fromDate, toDate))
    .filter((r) => r.paidMinutes > 0); // exclude employees with no logs in range from the mean

  const logs = getDailyLogs(ids, fromDate, toDate);
  const correct = computeDepartmentRollup(logs.map(toLabourRecord), LABOUR_CONFIG);

  return {
    correct,
    naiveMeanTrueEfficiencyPct: naiveMeanTrueEfficiencyPct(employeeResults),
    employeeCount: employeeResults.length,
  };
}

export interface ComparativeMetrics {
  employee: LabourResult;
  department: LabourResult;
  bakery: LabourResult;
  departmentName: string;
}

export function getComparativeMetrics(employeeId: string, fromDate: string, toDate: string): ComparativeMetrics | null {
  const employee = db.prepare('SELECT department FROM employees WHERE id = ?').get(employeeId) as { department: string } | undefined;
  if (!employee) return null;

  return {
    employee: getEmployeeMetrics(employeeId, fromDate, toDate),
    department: getDepartmentMetrics(employee.department, fromDate, toDate),
    bakery: getBakeryMetrics(fromDate, toDate),
    departmentName: employee.department,
  };
}

/** Every department name a session is scoped to: every department for manager/hr_admin, just their own for supervisor. */
function scopedDepartmentNames(session: EmployeeSession): string[] {
  return session.role === 'manager' || session.role === 'hr_admin'
    ? (db.prepare('SELECT DISTINCT department FROM employees').all() as { department: string }[]).map((d) => d.department)
    : [session.department];
}

/**
 * Department Analysis's data source — unlike getWorkforceOverview (manager/
 * hr_admin only, every department + bakery totals), this returns only the
 * departments the caller is actually scoped to: every department for
 * manager/hr_admin, just their own for supervisor. Fixes the bug where a
 * supervisor's Department Analysis tab called the manager-only endpoint and
 * silently 403'd.
 */
export function getDepartmentsMetrics(session: EmployeeSession, fromDate: string, toDate: string): { name: string; result: LabourResult }[] {
  return scopedDepartmentNames(session).map((name) => ({ name, result: getDepartmentMetrics(name, fromDate, toDate) }));
}

export interface CauseBreakdownEntry {
  cause: string;
  minutes: number;
  count: number;
}

export interface DepartmentCauseBreakdown {
  department: string;
  downtime: CauseBreakdownEntry[];
  changeover: CauseBreakdownEntry[];
}

const CAUSE_NOT_RECORDED = 'Not recorded (before cause tracking)';

function summarizeCauses(logs: DailyLogRow[], minutesKey: 'downtimeMinutes' | 'changeoverMinutes', causeKey: 'downtimeCauseCode' | 'changeoverCauseCode'): CauseBreakdownEntry[] {
  const byCause = new Map<string, { minutes: number; count: number }>();
  for (const log of logs) {
    const minutes = log[minutesKey];
    if (minutes <= 0) continue;
    const cause = log[causeKey] ?? CAUSE_NOT_RECORDED;
    const entry = byCause.get(cause) ?? { minutes: 0, count: 0 };
    entry.minutes += minutes;
    entry.count += 1;
    byCause.set(cause, entry);
  }
  return [...byCause.entries()].map(([cause, v]) => ({ cause, ...v })).sort((a, b) => b.minutes - a.minutes);
}

/**
 * Total downtime/changeover minutes and record count grouped by cause, per
 * department — the point of collecting cause codes at all: so a manager can tell
 * whether lost time is a maintenance problem, a procurement problem, or a
 * scheduling problem, not just a bare minute count. Pre-migration rows (minutes
 * logged, no cause ever collected) group under CAUSE_NOT_RECORDED rather than
 * being dropped or crashing on a null group key. Scoped the same as
 * getDepartmentsMetrics.
 */
export function getCauseBreakdown(session: EmployeeSession, fromDate: string, toDate: string): DepartmentCauseBreakdown[] {
  return scopedDepartmentNames(session).map((name) => {
    const logs = getDailyLogs(employeeIdsInDepartment(name), fromDate, toDate);
    return {
      department: name,
      downtime: summarizeCauses(logs, 'downtimeMinutes', 'downtimeCauseCode'),
      changeover: summarizeCauses(logs, 'changeoverMinutes', 'changeoverCauseCode'),
    };
  });
}

export function getWorkforceOverview(fromDate: string, toDate: string) {
  const activeEmployees = getEmployees('all').filter((e) => e.active);
  const bakery = getBakeryMetrics(fromDate, toDate);

  const departments = db.prepare('SELECT DISTINCT department FROM employees').all() as { department: string }[];
  const departmentSummaries = departments.map((d) => ({
    name: d.department,
    result: getDepartmentMetrics(d.department, fromDate, toDate),
  }));

  return { activeEmployeeCount: activeEmployees.length, bakery, departments: departmentSummaries };
}
