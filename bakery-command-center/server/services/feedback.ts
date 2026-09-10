import { db } from '../db.ts';
import { createAuditEvent } from './audit.ts';
import type { Role } from '../auth.ts';

export interface FeedbackRow {
  id: number;
  employeeId: string;
  category: string;
  assessment: string | null;
  comment: string;
  followUpDate: string | null;
  createdByEmployeeId: string;
  createdAt: string;
  acknowledgedAt: string | null;
  employeeResponse: string | null;
}

interface RawFeedbackRow {
  id: number;
  employee_id: string;
  category: string;
  assessment: string | null;
  comment: string;
  follow_up_date: string | null;
  created_by_employee_id: string;
  created_at: string;
  acknowledged_at: string | null;
  employee_response: string | null;
}

function toFeedbackRow(r: RawFeedbackRow): FeedbackRow {
  return {
    id: r.id,
    employeeId: r.employee_id,
    category: r.category,
    assessment: r.assessment,
    comment: r.comment,
    followUpDate: r.follow_up_date,
    createdByEmployeeId: r.created_by_employee_id,
    createdAt: r.created_at,
    acknowledgedAt: r.acknowledged_at,
    employeeResponse: r.employee_response,
  };
}

export function getFeedback(employeeIds: string[] | 'all'): FeedbackRow[] {
  if (employeeIds === 'all') {
    return (db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all() as unknown as RawFeedbackRow[]).map(toFeedbackRow);
  }
  if (employeeIds.length === 0) return [];
  const placeholders = employeeIds.map(() => '?').join(',');
  return (
    db
      .prepare(`SELECT * FROM feedback WHERE employee_id IN (${placeholders}) ORDER BY created_at DESC`)
      .all(...employeeIds) as unknown as RawFeedbackRow[]
  ).map(toFeedbackRow);
}

export interface SaveFeedbackInput {
  employeeId: string;
  category: string;
  assessment?: string | null;
  comment: string;
  followUpDate?: string | null;
}

export function saveFeedback(input: SaveFeedbackInput, createdByEmployeeId: string, actorRole: Role): FeedbackRow {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO feedback (employee_id, category, assessment, comment, follow_up_date, created_by_employee_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.employeeId, input.category, input.assessment ?? null, input.comment, input.followUpDate ?? null, createdByEmployeeId, now);

  createAuditEvent({ actorEmployeeId: createdByEmployeeId, actorRole, action: 'feedback_created', affectedEmployeeId: input.employeeId, details: input.category });

  return toFeedbackRow(db.prepare('SELECT * FROM feedback WHERE id = ?').get(result.lastInsertRowid) as unknown as RawFeedbackRow);
}

/** The employee may acknowledge and add a response — never alter the manager's original comment (§13). */
export function acknowledgeFeedback(id: number, employeeResponse: string | null, actorEmployeeId: string, actorRole: Role): FeedbackRow | null {
  const existing = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id) as unknown as RawFeedbackRow | undefined;
  if (!existing) return null;

  db.prepare('UPDATE feedback SET acknowledged_at = ?, employee_response = ? WHERE id = ?').run(
    new Date().toISOString(),
    employeeResponse,
    id,
  );
  createAuditEvent({ actorEmployeeId, actorRole, action: 'feedback_acknowledged', affectedEmployeeId: existing.employee_id, details: `#${id}` });

  return toFeedbackRow(db.prepare('SELECT * FROM feedback WHERE id = ?').get(id) as unknown as RawFeedbackRow);
}
