import { db } from '../db.ts';
import type { EmployeeSession } from '../auth.ts';
import { LABOUR_CONFIG } from '../../src/config/labourConfig.ts';
import {
  computeDepartmentRollup,
  computeTrendSeries,
  naiveMeanTrueEfficiencyPct,
  type LabourRecord,
  type LabourResult,
  type TrendPoint,
} from '../../src/lib/labourCalc.ts';
import { getDailyLogs, type DailyLogRow } from './dailyLogs.ts';
import { getEmployees } from './employees.ts';

function toLabourRecord(log: DailyLogRow): LabourRecord {
  return {
    paidMinutes: log.paidMinutes,
    breakMinutes: log.breakMinutes,
    changeoverMinutes: log.changeoverMinutes,
    downtimeMinutes: log.downtimeMinutes,
    productiveMinutes: log.productiveMinutes,
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

export function getDepartmentMetrics(departmentName: string, fromDate: string, toDate: string): LabourResult {
  const ids = employeeIdsInDepartment(departmentName);
  const logs = getDailyLogs(ids, fromDate, toDate);
  return computeDepartmentRollup(logs.map(toLabourRecord), LABOUR_CONFIG);
}

export function getBakeryMetrics(fromDate: string, toDate: string): LabourResult {
  const logs = getDailyLogs('all', fromDate, toDate);
  return computeDepartmentRollup(logs.map(toLabourRecord), LABOUR_CONFIG);
}

export function getEmployeeTrend(employeeId: string, fromDate: string, toDate: string): TrendPoint[] {
  return groupByDateAndRollUp(getDailyLogs([employeeId], fromDate, toDate));
}

export function getDepartmentTrend(departmentName: string, fromDate: string, toDate: string): TrendPoint[] {
  return groupByDateAndRollUp(getDailyLogs(employeeIdsInDepartment(departmentName), fromDate, toDate));
}

export function getBakeryTrend(fromDate: string, toDate: string): TrendPoint[] {
  return groupByDateAndRollUp(getDailyLogs('all', fromDate, toDate));
}

function groupByDateAndRollUp(logs: DailyLogRow[]): TrendPoint[] {
  const byDate = new Map<string, LabourRecord[]>();
  for (const log of logs) {
    const bucket = byDate.get(log.date) ?? [];
    bucket.push(toLabourRecord(log));
    byDate.set(log.date, bucket);
  }
  const periods = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, records]) => ({ period, records }));
  return computeTrendSeries(periods, LABOUR_CONFIG);
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

/**
 * Department Analysis's data source — unlike getWorkforceOverview (manager/
 * hr_admin only, every department + bakery totals), this returns only the
 * departments the caller is actually scoped to: every department for
 * manager/hr_admin, just their own for supervisor. Fixes the bug where a
 * supervisor's Department Analysis tab called the manager-only endpoint and
 * silently 403'd.
 */
export function getDepartmentsMetrics(session: EmployeeSession, fromDate: string, toDate: string): { name: string; result: LabourResult }[] {
  const departmentNames =
    session.role === 'manager' || session.role === 'hr_admin'
      ? (db.prepare('SELECT DISTINCT department FROM employees').all() as { department: string }[]).map((d) => d.department)
      : [session.department];

  return departmentNames.map((name) => ({ name, result: getDepartmentMetrics(name, fromDate, toDate) }));
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
