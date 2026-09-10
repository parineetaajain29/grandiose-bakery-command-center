// "Attention Required" (Employee Portal §21). Ships the concrete, easy-to-justify
// heuristics only — sustained-decline/trend-slope detection is deferred (see plan).
import { getDailyLogs } from './dailyLogs.ts';
import { getEmployees } from './employees.ts';
import { getGoals } from './goals.ts';
import { daysBetween, shiftDate } from './dateUtils.ts';

const HIGH_LOSS_MINUTES_PER_DAY = 90;
const MISSING_LOG_WINDOW_DAYS = 3;
const GOAL_DEADLINE_WINDOW_DAYS = 7;

export interface Alert {
  type: 'missing_logs' | 'high_downtime' | 'goal_deadline';
  severity: 'info' | 'warning';
  employeeId: string | null;
  employeeName: string | null;
  message: string;
}

/**
 * employeeIds scopes every check to the caller: self only (employee), own
 * department (supervisor), everyone (manager/hr_admin) — computed by
 * server/rbac.ts's scopeEmployeeIds and passed in by the route, never
 * defaulted to "all" here. This is the actual access boundary; the route's
 * role gate alone would not be enough, since a scoped-but-authenticated
 * caller (a supervisor) must not see alerts about employees outside their
 * department either.
 */
export function getAlerts(employeeIds: string[] | 'all', fromDate: string, toDate: string): Alert[] {
  const alerts: Alert[] = [];
  const activeEmployees = getEmployees(employeeIds).filter((e) => e.active);

  const recentFrom = shiftDate(toDate, -(MISSING_LOG_WINDOW_DAYS - 1));
  for (const emp of activeEmployees) {
    if (getDailyLogs([emp.id], recentFrom, toDate).length === 0) {
      alerts.push({
        type: 'missing_logs',
        severity: 'warning',
        employeeId: emp.id,
        employeeName: emp.name,
        message: `${emp.name} has no daily logs in the last ${MISSING_LOG_WINDOW_DAYS} days.`,
      });
    }
  }

  for (const emp of activeEmployees) {
    const logs = getDailyLogs([emp.id], fromDate, toDate);
    if (logs.length === 0) continue;
    const avgLoss = logs.reduce((sum, l) => sum + l.downtimeMinutes + l.changeoverMinutes, 0) / logs.length;
    if (avgLoss > HIGH_LOSS_MINUTES_PER_DAY) {
      alerts.push({
        type: 'high_downtime',
        severity: 'warning',
        employeeId: emp.id,
        employeeName: emp.name,
        message: `${emp.name} is averaging ${Math.round(avgLoss)} min/day of downtime + changeover, above the ${HIGH_LOSS_MINUTES_PER_DAY}-minute review threshold.`,
      });
    }
  }

  const employeeById = new Map(activeEmployees.map((e) => [e.id, e]));
  for (const goal of getGoals(employeeIds)) {
    if (goal.status !== 'active' || !goal.deadline) continue;
    const daysUntil = daysBetween(toDate, goal.deadline);
    if (daysUntil >= 0 && daysUntil <= GOAL_DEADLINE_WINDOW_DAYS) {
      const emp = employeeById.get(goal.employeeId);
      alerts.push({
        type: 'goal_deadline',
        severity: 'info',
        employeeId: goal.employeeId,
        employeeName: emp?.name ?? null,
        message: `Goal "${goal.title}" for ${emp?.name ?? goal.employeeId} is due in ${daysUntil} day(s).`,
      });
    }
  }

  return alerts;
}
