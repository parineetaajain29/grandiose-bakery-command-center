import { Router } from 'express';
import { requireAuth, scopeEmployeeIds, canViewEmployee } from '../rbac.ts';
import { getEmployee, getEmployees, getDepartments } from '../services/employees.ts';

export const employeesRouter = Router();

employeesRouter.get('/employees', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  res.json(getEmployees(scopeEmployeeIds(session)));
});

employeesRouter.get('/departments', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  res.json(getDepartments());
});

employeesRouter.get('/employees/:id', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!canViewEmployee(session, req.params.id)) {
    return res.status(403).json({ error: 'not authorised to view this employee' });
  }
  const employee = getEmployee(req.params.id);
  if (!employee) return res.status(404).json({ error: 'employee not found' });
  res.json(employee);
});
