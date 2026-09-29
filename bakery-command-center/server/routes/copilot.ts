// Grandiose Copilot's route (Phase 4 of the implementation plan) — the
// composition layer. This is the ONLY place that wires the interpretation
// LLM call, the deterministic tool layer, and the (optional) explanation LLM
// call together. Neither copilot.ts nor copilotTools.ts know about each
// other; this file is what makes them cooperate, following the router →
// tools → explanation architecture: interpret picks a tool name from a fixed
// enum, this file calls the real function for that name and does its own
// role check via the tool (never trusting the LLM's classification of who
// the question is "allowed" to be about), and only genuinely explanatory
// answers get a second LLM call — simple rankings/lookups are templated
// directly from verified data, which is both faster and one less place a
// number could be misstated.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../rbac.ts';
import { db } from '../db.ts';
import {
  interpretQuestion,
  explainResult,
  type CopilotViewContext,
  type ConversationTurn,
  type CopilotTool,
} from '../services/copilot.ts';
import {
  resolveEmployeeByName,
  getEmployeeComparison,
  getEmployeesNeedingAttention,
  getSkuRanking,
  getDivisionSummary,
  getManagementAttentionItems,
  getWastagePct,
  getB2BClientRanking,
  getB2BSummary,
  type ToolResult,
  type SkuMetric,
  type B2BRankMetric,
} from '../services/copilotTools.ts';
import { DIVISIONS, type Division } from '../../src/data/skuData.ts';

export const copilotRouter = Router();

const HISTORY_TURNS = 6; // matches interpretQuestion's own history.slice(-6)

interface CopilotAnswer {
  answer: string;
  evidence?: unknown;
  source?: string;
  actions: { label: string; page?: string }[];
  followUps: string[];
}

function friendlyToolError(message: string, code: string, candidates?: { id: string; label: string }[]): CopilotAnswer {
  return {
    answer: code === 'ambiguous' && candidates ? `${message} ${candidates.map((c) => c.label).join(' · ')}` : message,
    actions: [],
    followUps: [],
  };
}

const SKU_METRICS: SkuMetric[] = ['contribution', 'revenue', 'units'];
const B2B_METRICS: B2BRankMetric[] = ['deliveryCommitment', 'collectionExposure', 'revenue', 'margin'];

/**
 * Runs the real tool(s) for a classified intent and returns either a
 * templated answer (fast path — rankings/lookups, no second LLM call) or a
 * {needsExplanation} marker carrying the verified data for explainResult to
 * narrate. This is the one function in the whole feature that both reads the
 * LLM's classification AND has database access — kept deliberately small so
 * it's easy to audit that every branch re-derives permissions from `session`
 * via the tool functions, never from anything the LLM said.
 */
async function runTool(
  session: Parameters<typeof getEmployeeComparison>[0],
  tool: CopilotTool,
  params: Record<string, string | undefined>,
): Promise<{ kind: 'templated'; answer: CopilotAnswer } | { kind: 'explain'; verified: unknown; source: string } | { kind: 'error'; answer: CopilotAnswer }> {
  switch (tool) {
    case 'employee_comparison': {
      const name = params.employeeName;
      if (!name) return { kind: 'error', answer: friendlyToolError('Which employee did you mean?', 'not_found') };
      const resolved = resolveEmployeeByName(session, name);
      if (!resolved.ok) return { kind: 'error', answer: friendlyToolError(resolved.message, resolved.code, resolved.candidates) };
      const comparison = getEmployeeComparison(session, resolved.data.id);
      if (!comparison.ok) return { kind: 'error', answer: friendlyToolError(comparison.message, comparison.code) };
      return { kind: 'explain', verified: comparison.data, source: comparison.source };
    }

    case 'employees_needing_attention': {
      const result = getEmployeesNeedingAttention(session);
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      return { kind: 'explain', verified: result.data.slice(0, 5), source: result.source };
    }

    case 'sku_ranking': {
      const division = params.division && (DIVISIONS as readonly string[]).includes(params.division) ? (params.division as Division) : null;
      const metric = SKU_METRICS.includes(params.metric as SkuMetric) ? (params.metric as SkuMetric) : 'contribution';
      const result = getSkuRanking(division, metric, 5);
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      const top = result.data[0];
      return {
        kind: 'templated',
        answer: {
          answer: `${top.product} ranks #1 by ${metric}${division ? ` in ${division}` : ''}, at ${metric === 'contribution' ? `${top.contributionPct}% of total sales` : metric === 'revenue' ? `AED ${top.salesAed.toLocaleString()}` : `${top.units.toLocaleString()} units`}.`,
          evidence: result.data,
          source: result.source,
          actions: [{ label: 'View SKU Performance →', page: 'sku' }],
          followUps: ['Rank by revenue instead', 'Rank by units instead', division ? 'Show all divisions' : 'Filter to one division'],
        },
      };
    }

    case 'division_summary': {
      const result = getDivisionSummary();
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      const top = [...result.data].sort((a, b) => b.salesAed - a.salesAed)[0];
      return {
        kind: 'templated',
        answer: {
          answer: `${top.division} is the top-selling division at AED ${top.salesAed.toLocaleString()} across ${top.skuCount} SKUs.`,
          evidence: result.data,
          source: result.source,
          actions: [{ label: 'View SKU Performance →', page: 'sku' }],
          followUps: ['Which SKU is driving that?', 'Show all divisions'],
        },
      };
    }

    case 'management_attention_items': {
      const query = { scenario: params.scenario as never, granularity: params.granularity as never, month: params.month, quarter: params.quarter };
      const result = getManagementAttentionItems(query);
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      if (result.data.length === 0) {
        return {
          kind: 'templated',
          answer: { answer: 'Nothing is currently flagged for management attention — all tracked KPIs are within target.', evidence: [], source: result.source, actions: [], followUps: [] },
        };
      }
      return { kind: 'explain', verified: result.data, source: result.source };
    }

    case 'wastage': {
      const query = { scenario: params.scenario as never, granularity: params.granularity as never, month: params.month, quarter: params.quarter };
      const result = getWastagePct(query);
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      return {
        kind: 'templated',
        answer: {
          answer: `Wastage is running at ${result.data.wastagePct.toFixed(1)}% of revenue (AED ${result.data.wastageCostAed.toLocaleString()}).`,
          evidence: result.data,
          source: result.source,
          actions: [{ label: 'View Performance Tracker →', page: 'commandCenter' }],
          followUps: ['What are the biggest issues overall?'],
        },
      };
    }

    case 'b2b_ranking': {
      const metric = B2B_METRICS.includes(params.metric as B2BRankMetric) ? (params.metric as B2BRankMetric) : 'revenue';
      const result = getB2BClientRanking(metric, 5);
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      const top = result.data[0];
      return {
        kind: 'templated',
        answer: {
          answer: `${top.name} ranks #1 by ${metric === 'deliveryCommitment' ? 'delivery volume' : metric === 'collectionExposure' ? 'outstanding receivables' : metric}, at ${top.value.toLocaleString()} ${top.unit}.`,
          evidence: result.data,
          source: result.source,
          actions: [{ label: 'View B2B Performance →', page: 'b2b' }],
          followUps: ['Rank by revenue instead', 'Rank by margin instead'],
        },
      };
    }

    case 'b2b_summary': {
      const result = getB2BSummary();
      if (!result.ok) return { kind: 'error', answer: friendlyToolError(result.message, result.code) };
      return { kind: 'explain', verified: result.data, source: result.source };
    }

    case 'unsupported':
    default:
      return {
        kind: 'error',
        answer: {
          answer: "I don't have a way to answer that yet with the data I have access to.",
          actions: [],
          followUps: ['What are the biggest issues management should look at?', 'Which SKU has the highest contribution?'],
        },
      };
  }
}

function loadHistory(conversationId: string, employeeId: string): ConversationTurn[] {
  const rows = db
    .prepare('SELECT question, answer_json FROM copilot_messages WHERE conversation_id = ? AND employee_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(conversationId, employeeId, HISTORY_TURNS) as { question: string; answer_json: string }[];
  return rows
    .reverse()
    .map((r) => {
      let answerSummary = '';
      try {
        answerSummary = (JSON.parse(r.answer_json) as CopilotAnswer).answer ?? '';
      } catch {
        answerSummary = '';
      }
      return { question: r.question, answerSummary };
    });
}

copilotRouter.post('/copilot/ask', async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const body = req.body ?? {};
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question === '') return res.status(400).json({ error: 'question is required' });

  const conversationId = typeof body.conversationId === 'string' && body.conversationId !== '' ? body.conversationId : randomUUID();
  const viewContext: CopilotViewContext = {
    page: typeof body.viewContext?.page === 'string' ? body.viewContext.page : undefined,
    tab: typeof body.viewContext?.tab === 'string' ? body.viewContext.tab : undefined,
    division: typeof body.viewContext?.division === 'string' ? body.viewContext.division : undefined,
    period: typeof body.viewContext?.period === 'string' ? body.viewContext.period : undefined,
  };

  const history = loadHistory(conversationId, session.employeeId);

  const interpretation = await interpretQuestion(question, viewContext, history);
  if (!interpretation.ok) {
    if (interpretation.reason === 'not_configured') return res.status(409).json({ error: interpretation.message, reason: interpretation.reason });
    return res.status(502).json({ error: interpretation.message, reason: interpretation.reason });
  }

  if (interpretation.result.ambiguous && interpretation.result.clarifyingQuestion) {
    const answer: CopilotAnswer = { answer: interpretation.result.clarifyingQuestion, actions: [], followUps: [] };
    persist(conversationId, session.employeeId, question, viewContext, null, answer);
    return res.json({ conversationId, ...answer });
  }

  const outcome = await runTool(session, interpretation.result.tool, interpretation.result.params);

  let finalAnswer: CopilotAnswer;
  if (outcome.kind === 'templated') {
    finalAnswer = outcome.answer;
  } else if (outcome.kind === 'error') {
    finalAnswer = outcome.answer;
  } else {
    const explanation = await explainResult(question, interpretation.result.tool, outcome.verified);
    if (!explanation.ok) {
      // Explanation LLM call failed but the underlying data is real and verified —
      // fall back to showing it as evidence rather than losing the answer entirely.
      finalAnswer = { answer: explanation.message, evidence: outcome.verified, source: outcome.source, actions: [], followUps: [] };
    } else {
      finalAnswer = { answer: explanation.text, evidence: outcome.verified, source: outcome.source, actions: [], followUps: [] };
    }
  }

  persist(conversationId, session.employeeId, question, viewContext, interpretation.result.tool, finalAnswer);
  res.json({ conversationId, ...finalAnswer });
});

function persist(
  conversationId: string,
  employeeId: string,
  question: string,
  viewContext: CopilotViewContext,
  toolUsed: CopilotTool | null,
  answer: CopilotAnswer,
): void {
  try {
    db.prepare(
      'INSERT INTO copilot_messages (conversation_id, employee_id, question, view_context_json, tool_used, answer_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(conversationId, employeeId, question, JSON.stringify(viewContext), toolUsed, JSON.stringify(answer), new Date().toISOString());
  } catch {
    // Conversation history is a convenience, not a correctness requirement —
    // a failed write here should never break the response the user already has.
  }
}
