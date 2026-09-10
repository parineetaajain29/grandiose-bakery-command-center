import { Router } from 'express';
import { requireAuth, requireRole, canViewEmployee, canViewDepartmentAggregate } from '../rbac.ts';
import {
  getEmployeeMetrics,
  getDepartmentMetrics,
  getBakeryMetrics,
  getEmployeeTrend,
  getDepartmentTrend,
  getBakeryTrend,
  getComparativeMetrics,
  getDepartmentAggregationComparison,
  getDepartmentsMetrics,
  getCauseBreakdown,
  getWorkforceOverview,
  hasLegacyDataInRange,
} from '../services/metrics.ts';

export const metricsRouter = Router();

const MANAGEMENT_ROLES = ['supervisor', 'manager', 'hr_admin'] as const;

function range(req: import('express').Request): { from: string; to: string } {
  const from = typeof req.query.from === 'string' ? req.query.from : '2000-01-01';
  const to = typeof req.query.to === 'string' ? req.query.to : '2100-01-01';
  return { from, to };
}

// --- Self-only: every role, including a plain employee, can reach these for
// their OWN id — this is what My Performance runs on. ------------------------

metricsRouter.get('/metrics/employee/:id', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!canViewEmployee(session, req.params.id)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  res.json(getEmployeeMetrics(req.params.id, from, to));
});

metricsRouter.get('/metrics/employee/:id/legacy-check', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!canViewEmployee(session, req.params.id)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  res.json({ hasLegacyData: hasLegacyDataInRange(req.params.id, from, to) });
});

metricsRouter.get('/metrics/trend/employee/:id', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!canViewEmployee(session, req.params.id)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  res.json(getEmployeeTrend(req.params.id, from, to));
});

// --- Management-only: every one of these exists to power a comparison view
// (self vs. department, department vs. department, bakery-wide). Plain
// employees get zero peer/group comparison anywhere now, so these all require
// supervisor/manager/hr_admin up front, before the existing ownership/scope
// check underneath even runs. -------------------------------------------------

metricsRouter.get('/metrics/department/:name', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  if (!canViewDepartmentAggregate(session, req.params.name)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  res.json(getDepartmentMetrics(req.params.name, from, to));
});

metricsRouter.get('/metrics/departments', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getDepartmentsMetrics(session, from, to));
});

metricsRouter.get('/metrics/bakery', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getBakeryMetrics(from, to));
});

metricsRouter.get('/metrics/trend/department/:name', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  if (!canViewDepartmentAggregate(session, req.params.name)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  res.json(getDepartmentTrend(req.params.name, from, to));
});

metricsRouter.get('/metrics/trend/bakery', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getBakeryTrend(from, to));
});

metricsRouter.get('/metrics/comparative/:employeeId', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  if (!canViewEmployee(session, req.params.employeeId)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  const result = getComparativeMetrics(req.params.employeeId, from, to);
  if (!result) return res.status(404).json({ error: 'employee not found' });
  res.json(result);
});

metricsRouter.get('/metrics/aggregation-comparison/:departmentName', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  if (!canViewDepartmentAggregate(session, req.params.departmentName)) return res.status(403).json({ error: 'not authorised' });
  const { from, to } = range(req);
  res.json(getDepartmentAggregationComparison(req.params.departmentName, from, to));
});

metricsRouter.get('/metrics/cause-breakdown', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getCauseBreakdown(session, from, to));
});

metricsRouter.get('/metrics/workforce-overview', (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getWorkforceOverview(from, to));
});
