// Server-enforced access control (Employee Portal §2/§25). Every route that
// touches employee data calls these — hiding a button in the UI is not access
// control, so nothing here trusts the client to have already filtered anything.
import type { Request, Response } from 'express';
import { db } from './db.ts';
import type { EmployeeSession, Role } from './auth.ts';

export function requireAuth(req: Request, res: Response): EmployeeSession | null {
  const session = req.employeeSession;
  if (!session) {
    res.status(401).json({ error: 'log in first' });
    return null;
  }
  if (!session.active) {
    res.status(403).json({ error: 'this account has been deactivated' });
    return null;
  }
  return session;
}

export function requireRole(req: Request, res: Response, roles: Role[]): EmployeeSession | null {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (!roles.includes(session.role)) {
    res.status(403).json({ error: 'not authorised for this action' });
    return null;
  }
  return session;
}

/** Every employee id a session is allowed to see: self only (employee), own department (supervisor), everyone (manager/hr_admin). */
export function scopeEmployeeIds(session: EmployeeSession): string[] | 'all' {
  if (session.role === 'manager' || session.role === 'hr_admin') return 'all';
  if (session.role === 'supervisor') {
    const rows = db.prepare('SELECT id FROM employees WHERE department = ?').all(session.department) as { id: string }[];
    return rows.map((r) => r.id);
  }
  return [session.employeeId];
}

export function canViewEmployee(session: EmployeeSession, targetEmployeeId: string): boolean {
  const scope = scopeEmployeeIds(session);
  return scope === 'all' || scope.includes(targetEmployeeId);
}

/** Only manager/hr_admin/the employee's own supervisor may log entries or set goals/feedback on someone else's behalf. */
export function canActOnEmployee(session: EmployeeSession, targetEmployeeId: string): boolean {
  if (session.employeeId === targetEmployeeId) return true;
  if (session.role === 'manager' || session.role === 'hr_admin') return true;
  if (session.role === 'supervisor') return canViewEmployee(session, targetEmployeeId);
  return false;
}

/**
 * A department-level AGGREGATE (no individual records) is fine for anyone to see
 * for their own department — that's exactly what the employee comparative
 * analysis needs (self vs. department average vs. bakery average, §5) without
 * exposing any other individual's raw data. Manager/hr_admin can see any department.
 */
export function canViewDepartmentAggregate(session: EmployeeSession, departmentName: string): boolean {
  return session.role === 'manager' || session.role === 'hr_admin' || session.department === departmentName;
}
