import { Router } from 'express';
import { requireAuth, requireRole, scopeEmployeeIds } from '../rbac.ts';
import { getAlerts } from '../services/alerts.ts';
import { getDataQualityIssues } from '../services/dataQuality.ts';

export const alertsRouter = Router();

function range(req: import('express').Request): { from: string; to: string } {
  const from = typeof req.query.from === 'string' ? req.query.from : '2000-01-01';
  const to = typeof req.query.to === 'string' ? req.query.to : '2100-01-01';
  return { from, to };
}

/**
 * Every role gets its own alerts now (employee: self; supervisor: own
 * department; manager/hr_admin: everyone) — the scope comes from
 * scopeEmployeeIds and is enforced inside getAlerts itself, not by filtering
 * a company-wide result after the fact.
 */
alertsRouter.get('/alerts', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getAlerts(scopeEmployeeIds(session), from, to));
});

alertsRouter.get('/data-quality', (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  const { from, to } = range(req);
  res.json(getDataQualityIssues(from, to));
});
