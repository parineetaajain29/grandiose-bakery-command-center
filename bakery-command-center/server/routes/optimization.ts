import { Router } from 'express';
import { requireRole } from '../rbac.ts';
import { runOptimization, type OptimizationRequestBody } from '../services/optimization.ts';

// Same role gate as Data Processor and Settings — this file defines its own
// local constant rather than importing a shared one, matching the pattern
// already established across settings.ts, aiRisk.ts, and dataProcessor.ts.
const MANAGEMENT_ROLES = ['manager', 'hr_admin'] as const;

export const optimizationRouter = Router();

optimizationRouter.post('/optimization/run', async (req, res) => {
  const session = requireRole(req, res, MANAGEMENT_ROLES);
  if (!session) return;

  const body: OptimizationRequestBody = req.body ?? {};
  const usedCustomData = Boolean(body.sku_data || body.resource_limits);

  const outcome = await runOptimization(body);

  if (!outcome.ok) {
    const status = outcome.reason === 'invalid_input' ? 400 : 502;
    res.status(status).json({ error: outcome.message });
    return;
  }

  res.json({ ...outcome.result, isDemoData: !usedCustomData });
});
