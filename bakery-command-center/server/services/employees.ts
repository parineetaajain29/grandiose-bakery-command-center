import { db } from '../db.ts';
import { hashPin, type Role } from '../auth.ts';

export interface EmployeeRow {
  id: string;
  name: string;
  department: string;
  shift: string;
  role: Role;
  active: boolean;
}

interface RawEmployeeRow {
  id: string;
  name: string;
  department: string;
  shift: string;
  role: Role;
  active: number;
}

function toEmployeeRow(r: RawEmployeeRow): EmployeeRow {
  return { id: r.id, name: r.name, department: r.department, shift: r.shift, role: r.role, active: r.active === 1 };
}

export function getEmployee(id: string): EmployeeRow | null {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as unknown as RawEmployeeRow | undefined;
  return row ? toEmployeeRow(row) : null;
}

/** ids: 'all' or a specific list (already scoped by rbac.ts's scopeEmployeeIds). */
export function getEmployees(ids: string[] | 'all'): EmployeeRow[] {
  if (ids === 'all') {
    const rows = db.prepare('SELECT * FROM employees ORDER BY id').all() as unknown as RawEmployeeRow[];
    return rows.map(toEmployeeRow);
  }
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM employees WHERE id IN (${placeholders}) ORDER BY id`).all(...ids) as unknown as RawEmployeeRow[];
  return rows.map(toEmployeeRow);
}

export function getDepartments() {
  return db.prepare('SELECT * FROM departments ORDER BY name').all() as {
    name: string;
    type: 'production' | 'support';
    allocation_weight: number | null;
    allocation_basis_note: string | null;
  }[];
}

export function setActive(employeeId: string, active: boolean): void {
  db.prepare('UPDATE employees SET active = ? WHERE id = ?').run(active ? 1 : 0, employeeId);
}

/** Returns the new PIN so the caller (an hr_admin route) can hand it back once — never stored or logged in plaintext. */
export function resetPin(employeeId: string, newPin: string): void {
  db.prepare('UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE employee_id = ?').run(
    hashPin(newPin),
    employeeId,
  );
}
