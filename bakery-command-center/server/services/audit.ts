import { db } from '../db.ts';
import type { Role } from '../auth.ts';

export interface AuditEventInput {
  actorEmployeeId: string | null;
  actorRole: Role | null;
  action: string;
  affectedEmployeeId?: string | null;
  details?: string | null;
}

/** Never pass a PIN or hash into `details` — this table is manager/HR-visible. */
export function createAuditEvent(input: AuditEventInput): void {
  db.prepare('INSERT INTO audit_log (at, actor_employee_id, actor_role, action, affected_employee_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
    new Date().toISOString(),
    input.actorEmployeeId,
    input.actorRole,
    input.action,
    input.affectedEmployeeId ?? null,
    input.details ?? null,
  );
}

export interface AuditEventRow {
  id: number;
  at: string;
  actorEmployeeId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  affectedEmployeeId: string | null;
  affectedName: string | null;
  details: string | null;
}

interface RawAuditRow {
  id: number;
  at: string;
  actor_employee_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  affected_employee_id: string | null;
  affected_name: string | null;
  details: string | null;
}

export function getAuditLogs(limit = 200): AuditEventRow[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.at, a.actor_employee_id, actor.name AS actor_name, a.actor_role, a.action, a.affected_employee_id, affected.name AS affected_name, a.details
       FROM audit_log a
       LEFT JOIN employees actor ON actor.id = a.actor_employee_id
       LEFT JOIN employees affected ON affected.id = a.affected_employee_id
       ORDER BY a.id DESC
       LIMIT ?`,
    )
    .all(limit) as unknown as RawAuditRow[];

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actorEmployeeId: r.actor_employee_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    action: r.action,
    affectedEmployeeId: r.affected_employee_id,
    affectedName: r.affected_name,
    details: r.details,
  }));
}
