import { Router } from 'express';
import crypto from 'node:crypto';
import { requireRole } from '../rbac.ts';
import { getEmployee, setActive, resetPin } from '../services/employees.ts';
import { createAuditEvent } from '../services/audit.ts';

export const adminRouter = Router();

adminRouter.post('/admin/employees/:id/activate', (req, res) => {
  const session = requireRole(req, res, ['hr_admin']);
  if (!session) return;
  const employee = getEmployee(req.params.id);
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  setActive(req.params.id, true);
  createAuditEvent({ actorEmployeeId: session.employeeId, actorRole: session.role, action: 'employee_activated', affectedEmployeeId: req.params.id });
  res.json({ ...employee, active: true });
});

adminRouter.post('/admin/employees/:id/deactivate', (req, res) => {
  const session = requireRole(req, res, ['hr_admin']);
  if (!session) return;
  const employee = getEmployee(req.params.id);
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  setActive(req.params.id, false);
  createAuditEvent({ actorEmployeeId: session.employeeId, actorRole: session.role, action: 'employee_deactivated', affectedEmployeeId: req.params.id });
  res.json({ ...employee, active: false });
});

/** Generates a new random 4-digit PIN, stores only its hash, and returns the plaintext PIN exactly once so HR can hand it to the employee out-of-band. Never logged or stored in plaintext. */
adminRouter.post('/admin/employees/:id/reset-pin', (req, res) => {
  const session = requireRole(req, res, ['hr_admin']);
  if (!session) return;
  const employee = getEmployee(req.params.id);
  if (!employee) return res.status(404).json({ error: 'employee not found' });

  const newPin = String(1000 + crypto.randomInt(9000)); // 1000-9999
  resetPin(req.params.id, newPin);
  createAuditEvent({ actorEmployeeId: session.employeeId, actorRole: session.role, action: 'pin_reset', affectedEmployeeId: req.params.id });
  res.json({ employeeId: req.params.id, newPin });
});
