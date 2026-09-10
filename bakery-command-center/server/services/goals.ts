import { db } from '../db.ts';
import { createAuditEvent } from './audit.ts';
import type { Role } from '../auth.ts';

export type GoalStatus = 'active' | 'completed' | 'overdue' | 'cancelled';

export interface GoalRow {
  id: number;
  employeeId: string;
  title: string;
  metric: string | null;
  baseline: number | null;
  target: number | null;
  deadline: string | null;
  notes: string | null;
  status: GoalStatus;
  createdByEmployeeId: string;
  createdAt: string;
  updatedAt: string;
}

interface RawGoalRow {
  id: number;
  employee_id: string;
  title: string;
  metric: string | null;
  baseline: number | null;
  target: number | null;
  deadline: string | null;
  notes: string | null;
  status: GoalStatus;
  created_by_employee_id: string;
  created_at: string;
  updated_at: string;
}

function toGoalRow(r: RawGoalRow): GoalRow {
  return {
    id: r.id,
    employeeId: r.employee_id,
    title: r.title,
    metric: r.metric,
    baseline: r.baseline,
    target: r.target,
    deadline: r.deadline,
    notes: r.notes,
    status: r.status,
    createdByEmployeeId: r.created_by_employee_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getGoals(employeeIds: string[] | 'all'): GoalRow[] {
  if (employeeIds === 'all') {
    return (db.prepare('SELECT * FROM goals ORDER BY deadline').all() as unknown as RawGoalRow[]).map(toGoalRow);
  }
  if (employeeIds.length === 0) return [];
  const placeholders = employeeIds.map(() => '?').join(',');
  return (
    db.prepare(`SELECT * FROM goals WHERE employee_id IN (${placeholders}) ORDER BY deadline`).all(...employeeIds) as unknown as RawGoalRow[]
  ).map(toGoalRow);
}

export function getGoalById(id: number): GoalRow | null {
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as unknown as RawGoalRow | undefined;
  return row ? toGoalRow(row) : null;
}

export interface SaveGoalInput {
  employeeId: string;
  title: string;
  metric?: string | null;
  baseline?: number | null;
  target?: number | null;
  deadline?: string | null;
  notes?: string | null;
}

export function saveGoal(input: SaveGoalInput, createdByEmployeeId: string, actorRole: Role): GoalRow {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO goals (employee_id, title, metric, baseline, target, deadline, notes, status, created_by_employee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .run(
      input.employeeId,
      input.title,
      input.metric ?? null,
      input.baseline ?? null,
      input.target ?? null,
      input.deadline ?? null,
      input.notes ?? null,
      createdByEmployeeId,
      now,
      now,
    );

  createAuditEvent({ actorEmployeeId: createdByEmployeeId, actorRole, action: 'goal_created', affectedEmployeeId: input.employeeId, details: input.title });

  return toGoalRow(db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid) as unknown as RawGoalRow);
}

export function updateGoalStatus(id: number, status: GoalStatus, actorEmployeeId: string, actorRole: Role): GoalRow | null {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as unknown as RawGoalRow | undefined;
  if (!existing) return null;

  db.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  createAuditEvent({ actorEmployeeId, actorRole, action: 'goal_updated', affectedEmployeeId: existing.employee_id, details: `#${id} -> ${status}` });

  return toGoalRow(db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as unknown as RawGoalRow);
}
