import { db } from '../db.ts';
import { deriveProductiveMinutes, validateDailyLogInput, type DailyLogInput } from '../../src/lib/labourCalc.ts';
import type { Role } from '../auth.ts';
import { createAuditEvent } from './audit.ts';

export interface DailyLogRow {
  id: number;
  employeeId: string;
  date: string;
  shift: string;
  paidMinutes: number;
  breakMinutes: number;
  changeoverMinutes: number;
  downtimeMinutes: number;
  idleMinutes: number;
  productiveMinutes: number;
  /** True only for rows that predate idle-minutes tracking — their productiveMinutes was typed directly, not derived. See server/db.ts's migration comment. */
  productiveSelfReported: boolean;
  activityType: string;
  unitsProduced: number | null;
  downtimeCauseCode: string | null;
  changeoverCauseCode: string | null;
  notes: string | null;
  lossReason: string | null;
  dailySalaryCost: number;
  revenueAttributed: number;
  createdByEmployeeId: string;
  createdAt: string;
  updatedAt: string;
}

interface RawDailyLogRow {
  id: number;
  employee_id: string;
  date: string;
  shift: string;
  paid_minutes: number;
  break_minutes: number;
  changeover_minutes: number;
  downtime_minutes: number;
  idle_minutes: number | null;
  productive_minutes: number;
  productive_self_reported: number;
  activity_type: string;
  units_produced: number | null;
  downtime_cause_code: string | null;
  changeover_cause_code: string | null;
  notes: string | null;
  loss_reason: string | null;
  daily_salary_cost: number;
  revenue_attributed: number;
  created_by_employee_id: string;
  created_at: string;
  updated_at: string;
}

function toDailyLogRow(r: RawDailyLogRow): DailyLogRow {
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: r.date,
    shift: r.shift,
    paidMinutes: r.paid_minutes,
    breakMinutes: r.break_minutes,
    changeoverMinutes: r.changeover_minutes,
    downtimeMinutes: r.downtime_minutes,
    idleMinutes: r.idle_minutes ?? 0,
    productiveMinutes: r.productive_minutes,
    productiveSelfReported: r.productive_self_reported === 1,
    activityType: r.activity_type,
    unitsProduced: r.units_produced,
    downtimeCauseCode: r.downtime_cause_code,
    changeoverCauseCode: r.changeover_cause_code,
    notes: r.notes,
    lossReason: r.loss_reason,
    dailySalaryCost: r.daily_salary_cost,
    revenueAttributed: r.revenue_attributed,
    createdByEmployeeId: r.created_by_employee_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** employeeIds: 'all' or an already-RBAC-scoped list. fromDate/toDate inclusive, YYYY-MM-DD. */
export function getDailyLogs(employeeIds: string[] | 'all', fromDate?: string, toDate?: string): DailyLogRow[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (employeeIds !== 'all') {
    if (employeeIds.length === 0) return [];
    clauses.push(`employee_id IN (${employeeIds.map(() => '?').join(',')})`);
    params.push(...employeeIds);
  }
  if (fromDate) {
    clauses.push('date >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    clauses.push('date <= ?');
    params.push(toDate);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM daily_logs ${where} ORDER BY date, employee_id`).all(...params) as unknown as RawDailyLogRow[];
  return rows.map(toDailyLogRow);
}

export interface SaveDailyLogInput extends DailyLogInput {
  employeeId: string;
  notes?: string | null;
  lossReason?: string | null;
  dailySalaryCost?: number | null;
  revenueAttributed?: number | null;
}

export type SaveDailyLogResult = { ok: true; log: DailyLogRow } | { ok: false; errors: string[] };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cause codes only mean anything alongside their minutes — quietly drop a stray code left over from an earlier edit rather than rejecting the save over it. */
function normalizedCauseCodes(input: DailyLogInput): { downtimeCauseCode: string | null; changeoverCauseCode: string | null } {
  return {
    downtimeCauseCode: input.downtimeMinutes > 0 ? (input.downtimeCauseCode ?? null) : null,
    changeoverCauseCode: input.changeoverMinutes > 0 ? (input.changeoverCauseCode ?? null) : null,
  };
}

export function saveDailyLog(input: SaveDailyLogInput, createdByEmployeeId: string, actorRole: Role): SaveDailyLogResult {
  const errors = validateDailyLogInput(input);

  const existing = db
    .prepare('SELECT id FROM daily_logs WHERE employee_id = ? AND date = ? AND shift = ?')
    .get(input.employeeId, input.date, input.shift) as { id: number } | undefined;
  if (existing) {
    errors.push('A log already exists for this employee, date, and shift. Edit the existing entry instead.');
  }

  if (errors.length > 0) return { ok: false, errors };

  const now = new Date().toISOString();
  const dailySalaryCost = input.dailySalaryCost ?? 0;
  const revenueAttributed = input.revenueAttributed ?? 0;
  // Productive minutes are never taken from the caller, even if present in the request
  // body — always derived here from the four reported categories, so an inflated
  // client-sent figure is simply ignored rather than trusted.
  const productiveMinutes = deriveProductiveMinutes(input);
  const { downtimeCauseCode, changeoverCauseCode } = normalizedCauseCodes(input);

  const result = db
    .prepare(
      `INSERT INTO daily_logs
        (employee_id, date, shift, paid_minutes, break_minutes, changeover_minutes, downtime_minutes, idle_minutes, productive_minutes, activity_type, units_produced, downtime_cause_code, changeover_cause_code, notes, loss_reason, daily_salary_cost, revenue_attributed, created_by_employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.employeeId,
      input.date,
      input.shift,
      input.paidMinutes,
      input.breakMinutes,
      input.changeoverMinutes,
      input.downtimeMinutes,
      input.idleMinutes,
      productiveMinutes,
      input.activityType,
      input.unitsProduced ?? null,
      downtimeCauseCode,
      changeoverCauseCode,
      input.notes ?? null,
      input.lossReason ?? null,
      dailySalaryCost,
      revenueAttributed,
      createdByEmployeeId,
      now,
      now,
    );

  createAuditEvent({
    actorEmployeeId: createdByEmployeeId,
    actorRole,
    action: 'daily_log_created',
    affectedEmployeeId: input.employeeId,
    details: `${input.date} ${input.shift}`,
  });

  const row = db.prepare('SELECT * FROM daily_logs WHERE id = ?').get(result.lastInsertRowid) as unknown as RawDailyLogRow;
  return { ok: true, log: toDailyLogRow(row) };
}

export type UpdateDailyLogResult = { ok: true; log: DailyLogRow } | { ok: false; status: number; errors: string[] };

/**
 * Same-day records are editable by anyone who can act on the employee; older
 * records are locked for employee/supervisor roles — only manager/hr_admin can
 * edit history (§23). Every edit is written to the audit log with the original
 * created_at preserved.
 */
export function updateDailyLog(
  id: number,
  input: DailyLogInput & { notes?: string | null; lossReason?: string | null; dailySalaryCost?: number | null; revenueAttributed?: number | null },
  actorEmployeeId: string,
  actorRole: Role,
): UpdateDailyLogResult {
  const existing = db.prepare('SELECT * FROM daily_logs WHERE id = ?').get(id) as unknown as RawDailyLogRow | undefined;
  if (!existing) return { ok: false, status: 404, errors: ['log not found'] };

  const isOwnDay = existing.date === todayIso();
  const canEditHistory = actorRole === 'manager' || actorRole === 'hr_admin';
  if (!isOwnDay && !canEditHistory) {
    return { ok: false, status: 403, errors: ['Older records are locked — only a manager or HR can edit history.'] };
  }

  const errors = validateDailyLogInput(input);
  if (errors.length > 0) return { ok: false, status: 400, errors };

  const now = new Date().toISOString();
  const productiveMinutes = deriveProductiveMinutes(input);
  const { downtimeCauseCode, changeoverCauseCode } = normalizedCauseCodes(input);

  db.prepare(
    `UPDATE daily_logs SET
      date = ?, shift = ?, paid_minutes = ?, break_minutes = ?, changeover_minutes = ?, downtime_minutes = ?, idle_minutes = ?, productive_minutes = ?,
      activity_type = ?, units_produced = ?, downtime_cause_code = ?, changeover_cause_code = ?, notes = ?, loss_reason = ?, daily_salary_cost = ?, revenue_attributed = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.date,
    input.shift,
    input.paidMinutes,
    input.breakMinutes,
    input.changeoverMinutes,
    input.downtimeMinutes,
    input.idleMinutes,
    productiveMinutes,
    input.activityType,
    input.unitsProduced ?? null,
    downtimeCauseCode,
    changeoverCauseCode,
    input.notes ?? null,
    input.lossReason ?? null,
    input.dailySalaryCost ?? existing.daily_salary_cost,
    input.revenueAttributed ?? existing.revenue_attributed,
    now,
    id,
  );

  createAuditEvent({
    actorEmployeeId,
    actorRole,
    action: 'daily_log_edited',
    affectedEmployeeId: existing.employee_id,
    details: `${existing.date} ${existing.shift} (log #${id})`,
  });

  const row = db.prepare('SELECT * FROM daily_logs WHERE id = ?').get(id) as unknown as RawDailyLogRow;
  return { ok: true, log: toDailyLogRow(row) };
}
