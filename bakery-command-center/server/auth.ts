// PIN-based individual login with server-enforced roles (Employee Portal §1/§2).
// Hand-rolled on node:sqlite + node:crypto deliberately, to avoid adding
// express-session/bcrypt as dependencies for something this small.
import crypto from 'node:crypto';
import { db } from './db.ts';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 1000 * 60 * 15; // 15 minutes
export const SESSION_COOKIE = 'sid';

export type Role = 'employee' | 'supervisor' | 'manager' | 'hr_admin';

export interface EmployeeSession {
  token: string;
  employeeId: string;
  name: string;
  department: string;
  shift: string;
  role: Role;
  active: boolean;
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function createSession(employeeId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, employee_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    employeeId,
    new Date().toISOString(),
    expiresAt,
  );
  return { token, expiresAt };
}

interface EmployeeSessionRow {
  employee_id: string;
  name: string;
  department: string;
  shift: string;
  role: Role;
  active: number;
}

/** Resolves a session cookie all the way to the employee's current role/department/active flag — read fresh every request, so a deactivation or role change takes effect immediately. */
export function resolveSession(token: string | undefined): EmployeeSession | null {
  if (!token) return null;

  const sessionRow = db.prepare('SELECT employee_id, expires_at FROM sessions WHERE token = ?').get(token) as
    | { employee_id: string; expires_at: string }
    | undefined;
  if (!sessionRow) return null;
  if (new Date(sessionRow.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  const employee = db.prepare('SELECT id AS employee_id, name, department, shift, role, active FROM employees WHERE id = ?').get(
    sessionRow.employee_id,
  ) as unknown as EmployeeSessionRow | undefined;
  if (!employee) return null;

  return {
    token,
    employeeId: employee.employee_id,
    name: employee.name,
    department: employee.department,
    shift: employee.shift,
    role: employee.role,
    active: employee.active === 1,
  };
}

export function deleteSession(token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = val;
  }
  return out;
}

// --- Failed-login lockout (§2) -------------------------------------------

export type LoginAttemptResult =
  | { outcome: 'locked'; retryAfter: string }
  | { outcome: 'success' }
  | { outcome: 'failed'; attemptsRemaining: number }
  | { outcome: 'failed-now-locked'; retryAfter: string };

interface UserRow {
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
}

/**
 * Verifies a PIN with a failed-attempt counter and temporary lockout — never
 * logs the PIN itself, only the outcome. Locking out and resetting both happen
 * here so the route handler can't accidentally skip one path.
 */
export function attemptLogin(employeeId: string, pin: string): LoginAttemptResult {
  const user = db.prepare('SELECT pin_hash, failed_attempts, locked_until FROM users WHERE employee_id = ?').get(
    employeeId,
  ) as unknown as UserRow | undefined;

  if (!user) {
    // No such account — don't distinguish "unknown employee" from "wrong PIN" in
    // the response, but there's nothing to lock either.
    return { outcome: 'failed', attemptsRemaining: MAX_FAILED_ATTEMPTS };
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { outcome: 'locked', retryAfter: user.locked_until };
  }

  if (verifyPin(pin, user.pin_hash)) {
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE employee_id = ?').run(employeeId);
    return { outcome: 'success' };
  }

  const attempts = user.failed_attempts + 1;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const retryAfter = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE employee_id = ?').run(attempts, retryAfter, employeeId);
    return { outcome: 'failed-now-locked', retryAfter };
  }

  db.prepare('UPDATE users SET failed_attempts = ? WHERE employee_id = ?').run(attempts, employeeId);
  return { outcome: 'failed', attemptsRemaining: MAX_FAILED_ATTEMPTS - attempts };
}
