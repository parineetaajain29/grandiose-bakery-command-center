import { Router } from 'express';
import { requireRole } from '../rbac.ts';
import { getAuditLogs } from '../services/audit.ts';

export const auditRouter = Router();

auditRouter.get('/audit-log', (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  res.json(getAuditLogs());
});
