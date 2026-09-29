// Grandiose Copilot — the two LLM call sites (Phase 3 of the implementation
// plan). Same idiom as anthropicInterpreter.ts and aiRisk.ts, the two
// existing LLM integrations in this codebase: construct the client per
// request, key from settings.ts (never env), system prompt demands strict
// JSON with no markdown fences, defensively strip fences anyway, JSON.parse
// in a try/catch, sanitize every field before trusting it. Same model,
// 'claude-sonnet-5', already validated elsewhere in this app.
//
// The critical property both functions below preserve: interpretQuestion
// NEVER sees real data (only a fixed tool-name enum + a small context
// object), and explainResult NEVER receives anything it wasn't already
// handed as verifiedResult — it is a narrator, not a calculator. Neither
// function talks to the database, copilotTools.ts, or any calc file
// directly; that composition happens one layer up, in the route (Phase 4).
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from './settings.ts';

const MODEL = 'claude-sonnet-5';

// ---------------------------------------------------------------------------
// Fixed tool enum. This list is the ONLY vocabulary the interpretation LLM
// call is allowed to choose from — it is never given the freedom to name an
// arbitrary function or invent a new one. Keep this in sync with the actual
// exported functions in copilotTools.ts; the route layer (Phase 4) maps each
// of these names to one or more real calls into that file.
// ---------------------------------------------------------------------------
export const COPILOT_TOOLS = [
  'employee_comparison', // "who has the highest/lowest true efficiency", "compare X with their division" — params: { employeeName }
  'employees_needing_attention', // "which employee needs attention" — no params
  'sku_ranking', // "highest contribution/revenue SKU in <division>" — params: { division?, metric: 'contribution'|'revenue'|'units' }
  'division_summary', // "which division sells the most" — no params
  'management_attention_items', // "biggest issues management should look at" — params: { scenario?, granularity?, month?, quarter? }
  'wastage', // "what is driving our wastage", "wastage %" — same params as management_attention_items
  'b2b_ranking', // "highest delivery commitment/collection exposure client" — params: { metric: 'deliveryCommitment'|'collectionExposure'|'revenue'|'margin' }
  'b2b_summary', // "how are we doing with B2B overall" — no params
  'unsupported', // question doesn't map to any tool above yet (e.g. optimization/AI Risk — later phases, or genuinely out of scope)
] as const;
export type CopilotTool = (typeof COPILOT_TOOLS)[number];

export interface CopilotViewContext {
  page?: string;
  tab?: string;
  division?: string;
  period?: string;
}

export interface ConversationTurn {
  question: string;
  /** Short plain-text summary of what was answered, not the full structured result — keeps history compact and never re-injects raw data the model didn't already narrate. */
  answerSummary: string;
}

export interface Interpretation {
  tool: CopilotTool;
  params: Record<string, string | undefined>;
  ambiguous: boolean;
  clarifyingQuestion?: string;
}

export type InterpretOutcome =
  | { ok: true; result: Interpretation }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'error'; message: string };

const INTERPRET_SYSTEM_PROMPT = `You are the question router for Grandiose Copilot, an analytics assistant embedded in a bakery management dashboard. You do NOT have access to any data yourself — your only job is to read the user's question and decide which ONE internal tool should answer it, and with what parameters.

Available tools (choose exactly one):
${COPILOT_TOOLS.map((t) => `- ${t}`).join('\n')}

Rules:
- Never invent a tool name outside this list. If nothing fits, use "unsupported".
- If the question is genuinely ambiguous about WHICH metric to use (e.g. "best SKU" could mean revenue, contribution, or units), still pick your best-guess tool and params, but set "ambiguous": true and fill "clarifyingQuestion" with a short question offering the real alternatives you know exist (Revenue, Contribution %, Units).
- If the question refers to "it"/"that"/"this division" etc., resolve it using the conversation history and/or the current view context you're given — never ask the user to repeat themselves if the answer is already inferable.
- Division names must be one of the bakery's real divisions if given (do not invent one from the question — if unsure, omit division and let the tool return an error instead of guessing).
- Employee names should be passed through exactly as the user wrote them (e.g. "Ahmed") — the tool layer resolves the real match, you don't need to guess a full name.

Respond with STRICT JSON only, no markdown fences, no commentary, exactly this shape:
{
  "tool": "<one of the tool names above>",
  "params": { ... },
  "ambiguous": true | false,
  "clarifyingQuestion": "..." (omit this key entirely if ambiguous is false)
}`;

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) return trimmed.replace(/^```(?:json)?\s*|\s*```$/g, '');
  return trimmed;
}

function sanitizeInterpretation(raw: unknown): Interpretation | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const tool = obj.tool;
  if (typeof tool !== 'string' || !(COPILOT_TOOLS as readonly string[]).includes(tool)) return null;

  const params: Record<string, string | undefined> = {};
  if (typeof obj.params === 'object' && obj.params !== null) {
    for (const [k, v] of Object.entries(obj.params as Record<string, unknown>)) {
      if (typeof v === 'string') params[k] = v;
    }
  }

  const ambiguous = obj.ambiguous === true;
  const clarifyingQuestion = typeof obj.clarifyingQuestion === 'string' ? obj.clarifyingQuestion : undefined;

  return { tool: tool as CopilotTool, params, ambiguous, clarifyingQuestion: ambiguous ? clarifyingQuestion : undefined };
}

export function isCopilotConfigured(): boolean {
  return getAnthropicApiKey() !== null;
}

export async function interpretQuestion(
  question: string,
  viewContext: CopilotViewContext,
  history: ConversationTurn[],
): Promise<InterpretOutcome> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "Grandiose Copilot isn't configured yet. Add an Anthropic API key in Settings." };
  }

  const contextLines: string[] = [];
  if (viewContext.page) contextLines.push(`Current page: ${viewContext.page}${viewContext.tab ? ` · ${viewContext.tab}` : ''}`);
  if (viewContext.division) contextLines.push(`Currently viewing division: ${viewContext.division}`);
  if (viewContext.period) contextLines.push(`Currently viewing period: ${viewContext.period}`);

  const historyLines = history.slice(-6).map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1} (summary): ${h.answerSummary}`);

  const userInput = [
    contextLines.length > 0 ? `View context:\n${contextLines.join('\n')}` : 'View context: none available.',
    historyLines.length > 0 ? `Recent conversation:\n${historyLines.join('\n\n')}` : '',
    `Current question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: INTERPRET_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }],
    });

    const rawText = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    const cleaned = stripFences(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: 'error', message: "Couldn't understand that question — try rephrasing it." };
    }

    const sanitized = sanitizeInterpretation(parsed);
    if (!sanitized) return { ok: false, reason: 'error', message: "Couldn't understand that question — try rephrasing it." };
    return { ok: true, result: sanitized };
  } catch (err) {
    // Same empirical finding as anthropicInterpreter.ts: Anthropic's own
    // auth-error body carries no key material, safe to surface as-is.
    return { ok: false, reason: 'error', message: `Copilot couldn't process that question: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// explainResult — the ONLY other LLM call site. It is handed already-verified
// data and told, explicitly, never to introduce a number that isn't in it.
// The route layer should skip this call entirely for simple single-value/
// ranking answers and template those directly (faster, and one less place a
// number could be paraphrased incorrectly) — this function is for genuinely
// explanatory/diagnostic questions only.
// ---------------------------------------------------------------------------
export type ExplainOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'error'; message: string };

const EXPLAIN_SYSTEM_PROMPT = `You are Grandiose Copilot, an analytics assistant for a bakery management dashboard. You will be given a user's question and a JSON object of ALREADY-VERIFIED data that a deterministic calculation already produced — you did not calculate any of it and must not recalculate, round differently, or introduce any number that is not present in the JSON given to you.

Write a concise, management-friendly answer (2-4 sentences, no long paragraphs). Never invent a number, entity, or comparison that isn't in the data you were given. If the data doesn't fully answer the question, say what it does show and what's missing — never fill the gap with a guess.

Be careful with wording about employees: never say someone is "the worst" or make a personnel judgment. If the data distinguishes a gap driven by low output from one driven by downtime/availability (a "likelyAvailabilityDriven" flag or similar), reflect that distinction — don't collapse it into a single blame-shaped sentence.

Respond with plain text only — no JSON, no markdown headers, no code fences.`;

export async function explainResult(question: string, toolName: CopilotTool, verifiedResult: unknown): Promise<ExplainOutcome> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "Grandiose Copilot isn't configured yet. Add an Anthropic API key in Settings." };
  }

  const userInput = `Question: ${question}\n\nTool used: ${toolName}\n\nVerified data (the only source of numbers you may use):\n${JSON.stringify(verifiedResult)}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }],
    });

    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim();
    if (!text) return { ok: false, reason: 'error', message: 'Copilot had nothing to add here.' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, reason: 'error', message: `Copilot couldn't explain that result: ${err instanceof Error ? err.message : String(err)}` };
  }
}
