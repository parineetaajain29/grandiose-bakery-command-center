// Data Quality (Employee Portal §22). Re-validates every stored daily log with
// the same rules the write path already enforces (src/lib/labourCalc.ts's
// validateDailyLogInput), so this doubles as a live check that nothing invalid
// slipped in — plus a couple of softer "worth a second look" heuristics.
// Duplicate (employee, date, shift) logs can't happen going forward — the table
// has a UNIQUE constraint — so that check isn't included here.
import { validateDailyLogInput } from '../../src/lib/labourCalc.ts';
import { getDailyLogs } from './dailyLogs.ts';
import { getEmployee } from './employees.ts';

const LONG_SHIFT_MINUTES = 12 * 60;

export interface DataQualityIssue {
  logId: number;
  employeeId: string;
  employeeName: string | null;
  date: string;
  issue: string;
}

export function getDataQualityIssues(fromDate: string, toDate: string): DataQualityIssue[] {
  const logs = getDailyLogs('all', fromDate, toDate);
  const nameCache = new Map<string, string | null>();
  const nameFor = (id: string) => {
    if (!nameCache.has(id)) nameCache.set(id, getEmployee(id)?.name ?? null);
    return nameCache.get(id) ?? null;
  };

  const issues: DataQualityIssue[] = [];
  for (const log of logs) {
    const errors = validateDailyLogInput({
      date: log.date,
      shift: log.shift,
      paidMinutes: log.paidMinutes,
      breakMinutes: log.breakMinutes,
      changeoverMinutes: log.changeoverMinutes,
      downtimeMinutes: log.downtimeMinutes,
      idleMinutes: log.idleMinutes,
      activityType: log.activityType,
      unitsProduced: log.unitsProduced,
      downtimeCauseCode: log.downtimeCauseCode,
      changeoverCauseCode: log.changeoverCauseCode,
    });
    for (const issue of errors) {
      issues.push({ logId: log.id, employeeId: log.employeeId, employeeName: nameFor(log.employeeId), date: log.date, issue });
    }
    if (log.paidMinutes > LONG_SHIFT_MINUTES) {
      issues.push({
        logId: log.id,
        employeeId: log.employeeId,
        employeeName: nameFor(log.employeeId),
        date: log.date,
        issue: 'Unusually long shift (over 12 hours) — worth a second look.',
      });
    }
  }
  return issues;
}
