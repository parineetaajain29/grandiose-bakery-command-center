import { Router } from 'express';
import { requireRole } from '../rbac.ts';
import { getResearch } from '../services/aiRisk.ts';
import {
  getSupplierResearch,
  isOpenAiConfigured,
  listSupplierResearchForResearchId,
  runSupplierSearch,
  type ProcurementSpec,
} from '../services/supplierIntelligence.ts';

export const supplierIntelligenceRouter = Router();

// Same role gate as AI Risk and Optimization Lab — Supplier Intelligence is
// only ever reached from inside AI Risk Intelligence, so it inherits that
// module's own authorization, enforced here again (not just hidden in the
// UI) rather than trusted from the frontend.
const MANAGEMENT_ROLES = ['manager', 'hr_admin'] as const;

supplierIntelligenceRouter.get('/supplier-intelligence/status', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  res.json({ configured: isOpenAiConfigured() });
});

function parseSpec(body: Record<string, unknown>): ProcurementSpec {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  return {
    productSpec: str(body.productSpec),
    quantity: str(body.quantity),
    deliveryLocation: str(body.deliveryLocation),
    requiredBy: str(body.requiredBy),
    preferredGeography: str(body.preferredGeography),
    supplierType: str(body.supplierType),
    currency: str(body.currency),
  };
}

supplierIntelligenceRouter.post('/supplier-intelligence/search', async (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;

  const body = req.body ?? {};
  const material = typeof body.material === 'string' ? body.material.trim() : '';
  if (material === '') return res.status(400).json({ error: 'material is required' });

  // researchId links this search back to the AI Risk record it was launched
  // from (nullable — loose association, matching the DB column). If given,
  // it must resolve to a real ai_research row; a stale/invalid id is
  // rejected rather than silently stored as an orphan reference.
  let researchId: number | null = null;
  if (body.researchId !== undefined && body.researchId !== null) {
    const n = Number(body.researchId);
    if (!Number.isInteger(n) || !getResearch(n)) {
      return res.status(400).json({ error: 'researchId does not match a known research record' });
    }
    researchId = n;
  }

  const spec = parseSpec(body);
  const forceRefresh = body.forceRefresh === true;

  const outcome = await runSupplierSearch(material, spec, session.employeeId, forceRefresh, researchId);

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

supplierIntelligenceRouter.get('/supplier-intelligence/search/:id', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const research = getSupplierResearch(Number(req.params.id));
  if (!research) return res.status(404).json({ error: 'supplier research record not found' });
  res.json(research);
});

// Lets the Suppliers stage re-open a prior supplier search for the AI Risk
// record it's currently viewing, without the caller needing to already know
// the supplier_research row's own id (e.g. returning to an AI Risk record
// from history).
supplierIntelligenceRouter.get('/supplier-intelligence/by-research/:researchId', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const researchId = Number(req.params.researchId);
  if (!Number.isInteger(researchId)) return res.status(400).json({ error: 'invalid researchId' });
  res.json(listSupplierResearchForResearchId(researchId));
});
