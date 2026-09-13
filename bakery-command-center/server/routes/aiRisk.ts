import { Router } from 'express';
import { requireRole } from '../rbac.ts';
import {
  addWatchlistItem,
  deleteWatchlistItem,
  getResearch,
  getUsageStats,
  isOpenAiConfigured,
  listResearch,
  listWatchlist,
  runResearch,
  saveUserAssumptions,
  updateWatchlistItem,
  type ResearchParams,
} from '../services/aiRisk.ts';

export const aiRiskRouter = Router();

const MANAGEMENT_ROLES = ['manager', 'hr_admin'] as const;

aiRiskRouter.get('/ai-risk/status', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  res.json({ configured: isOpenAiConfigured() });
});

aiRiskRouter.post('/ai-risk/research', async (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;

  const body = req.body ?? {};
  const params: ResearchParams = {
    question: typeof body.question === 'string' ? body.question.trim() : '',
    horizon: body.horizon,
    riskType: body.riskType,
    rawMaterial: body.rawMaterial,
    depth: body.depth,
    geography: body.geography,
  };
  if (params.question === '') return res.status(400).json({ error: 'question is required' });

  const forceRefresh = body.forceRefresh === true;
  const outcome = await runResearch(params, session.employeeId, forceRefresh);

  if (!outcome.ok) {
    if (outcome.reason === 'not_configured') return res.status(409).json({ error: outcome.message, reason: outcome.reason });
    if (outcome.reason === 'monthly_cap') return res.status(429).json({ error: outcome.message, reason: outcome.reason });
    if (outcome.reason === 'rate_limit') {
      return res.status(429).json({ error: outcome.message, reason: outcome.reason, retryAfterSeconds: outcome.retryAfterSeconds });
    }
    return res.status(502).json({ error: outcome.message, reason: outcome.reason });
  }
  res.status(201).json({ research: outcome.research, cached: outcome.cached });
});

aiRiskRouter.get('/ai-risk/research', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  res.json(listResearch());
});

aiRiskRouter.get('/ai-risk/research/:id', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const research = getResearch(Number(req.params.id));
  if (!research) return res.status(404).json({ error: 'research record not found' });
  res.json(research);
});

aiRiskRouter.put('/ai-risk/research/:id/assumptions', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const assumptions = Array.isArray(req.body?.assumptions) ? req.body.assumptions : null;
  if (!assumptions) return res.status(400).json({ error: 'assumptions must be an array' });
  const updated = saveUserAssumptions(Number(req.params.id), assumptions);
  if (!updated) return res.status(404).json({ error: 'research record not found' });
  res.json(updated);
});

aiRiskRouter.get('/ai-risk/watchlist', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  res.json(listWatchlist());
});

aiRiskRouter.post('/ai-risk/watchlist', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const { risk, riskLevel, rawMaterial, geography, keyIndicator, reviewDate } = req.body ?? {};
  if (typeof risk !== 'string' || risk.trim() === '') return res.status(400).json({ error: 'risk is required' });
  if (riskLevel !== 'low' && riskLevel !== 'moderate' && riskLevel !== 'high') {
    return res.status(400).json({ error: 'riskLevel must be low, moderate, or high' });
  }
  const item = addWatchlistItem({ risk: risk.trim(), riskLevel, rawMaterial, geography, keyIndicator, reviewDate }, session.employeeId);
  res.status(201).json(item);
});

aiRiskRouter.put('/ai-risk/watchlist/:id', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const updated = updateWatchlistItem(Number(req.params.id), req.body ?? {});
  if (!updated) return res.status(404).json({ error: 'watchlist item not found' });
  res.json(updated);
});

aiRiskRouter.delete('/ai-risk/watchlist/:id', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const deleted = deleteWatchlistItem(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'watchlist item not found' });
  res.status(204).end();
});

aiRiskRouter.get('/ai-risk/usage', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  res.json(getUsageStats());
});
