import { Router } from 'express';
import { db } from '../db.ts';
import { attemptLogin, createSession, deleteSession, SESSION_COOKIE, type Role } from '../auth.ts';
import { createAuditEvent } from '../services/audit.ts';
import type { Response } from 'express';

export const authRouter = Router();

interface EmployeeRow {
  id: string;
  name: string;
  department: string;
  shift: string;
  role: string;
  active: number;
}

function setSessionCookie(res: Response, token: string, expiresAt: string) {
  const expires = new Date(expiresAt).toUTCString();
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Expires=${expires}`);
}

function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function publicEmployee(e: EmployeeRow) {
  return { id: e.id, name: e.name, department: e.department, shift: e.shift, role: e.role, active: e.active === 1 };
}

authRouter.post('/login', (req, res) => {
  try {
    const { employeeId, pin } = req.body ?? {};

    if (typeof employeeId !== 'string' || employeeId.trim() === '') {
      return res.status(400).json({ error: 'employeeId is required' });
    }
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'pin must be 4 digits' });
    }

    const employee = db.prepare('SELECT id, name, department, shift, role, active FROM employees WHERE id = ?').get(employeeId) as unknown as
      | EmployeeRow
      | undefined;

    // An unknown employee ID is a normal, expected failure — not a crash. Everything
    // past this point (attemptLogin, the audit writes) tolerates `employee` being
    // undefined; the outer try/catch is the backstop for anything that doesn't.
    if (employee && employee.active === 0) {
      // Don't leak "this account exists but is deactivated" to an unauthenticated caller.
      createAuditEvent({ actorEmployeeId: employeeId, actorRole: null, action: 'login_failed_deactivated' });
      return res.status(401).json({ error: 'incorrect employee or PIN' });
    }

    const attempt = attemptLogin(employeeId, pin);

    if (attempt.outcome === 'locked' || attempt.outcome === 'failed-now-locked') {
      createAuditEvent({ actorEmployeeId: employeeId, actorRole: null, action: 'login_locked' });
      return res.status(423).json({ error: 'too many incorrect attempts — try again later', retryAfter: attempt.retryAfter });
    }
    if (attempt.outcome === 'failed') {
      createAuditEvent({ actorEmployeeId: employeeId, actorRole: null, action: 'login_failed' });
      return res.status(401).json({ error: 'incorrect employee or PIN' });
    }

    // outcome === 'success' implies a matching row exists in `users`, which is only
    // ever inserted alongside a real `employees` row (see server/seed.ts) — so
    // `employee` is non-null here in every real scenario. Guard it anyway rather
    // than asserting with `!`: if that invariant is ever violated, this is a normal
    // 401, not a crash.
    if (!employee) {
      createAuditEvent({ actorEmployeeId: employeeId, actorRole: null, action: 'login_failed' });
      return res.status(401).json({ error: 'incorrect employee or PIN' });
    }

    const { token, expiresAt } = createSession(employeeId);
    setSessionCookie(res, token, expiresAt);
    createAuditEvent({ actorEmployeeId: employeeId, actorRole: employee.role as Role, action: 'login' });
    res.json(publicEmployee(employee));
  } catch (err) {
    console.error('POST /api/auth/login failed unexpectedly:', err);
    res.status(401).json({ error: 'incorrect employee or PIN' });
  }
});

authRouter.post('/logout', (req, res) => {
  const session = req.employeeSession;
  deleteSession(session?.token);
  clearSessionCookie(res);
  if (session) createAuditEvent({ actorEmployeeId: session.employeeId, actorRole: session.role, action: 'logout' });
  res.status(204).end();
});

authRouter.get('/me', (req, res) => {
  const session = req.employeeSession;
  if (!session) return res.status(401).json({ error: 'not logged in' });
  res.json({
    id: session.employeeId,
    name: session.name,
    department: session.department,
    shift: session.shift,
    role: session.role,
    active: session.active,
  });
});
