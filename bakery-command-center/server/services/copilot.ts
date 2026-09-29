// Grandiose Copilot — the two LLM call sites (Phase 3 of the implementation
// plan). Uses OpenAI (this app's other configured provider — aiRisk.ts's
// Responses API, without the web_search tool, since Copilot never needs live
// web results, only structured reasoning over data it's already been given)
// rather than Anthropic: the project only has a working OpenAI key configured
// in Settings today. Same idiom as both existing LLM integrations in this
// codebase either way: construct the client per request, key from
// settings.ts (never env), system prompt demands strict JSON with no
// markdown fences, defensively strip fences anyway, JSON.parse in a try/
// catch, sanitize every field before trusting it.
//
// The critical property both functions below preserve: interpretQuestion
// NEVER sees real data (only a fixed tool-name enum + a small context
// object), and explainResult NEVER receives anything it wasn't already
// handed as verifiedResult — it is a narrator, not a calculator. Neither
// function talks to the database, copilotTools.ts, or any calc file
// directly; that composition happens one layer up, in the route (Phase 4).
import OpenAI from 'openai';
import { getOpenAiApiKey } from './settings.ts';

const MODEL = 'gpt-5.5'; // same model aiRisk.ts already uses successfully with this key

/**
 * aiRisk.ts's own extractFinalText, duplicated rather than imported — that
 * file's version is a private, unexported helper scoped to its own
 * `OpenAI.Responses.Response` usage, and importing a private function across
 * service files would couple two otherwise-independent features. Same walk:
 * every 'message' output item's 'output_text' content, concatenated.
 */
function extractFinalText(response: OpenAI.Responses.Response): string {
  let text = '';
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type === 'output_text') text += content.text;
    }
  }
  return text;
}

/**
 * Same empirical finding as aiRisk.ts: OpenAI's SDK error messages can echo
 * a masked-but-still-partial fragment of the submitted key. Pattern-match
 * anything key-shaped before it ever reaches a log line or a client
 * response — never return err.message raw the way anthropicInterpreter.ts
 * safely can (different provider, different error shape).
 */
function redactKeyFragments(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/sk-[A-Za-z0-9*_-]{6,}/g, '[redacted]');
}

// ---------------------------------------------------------------------------
// Fixed tool enum. This list is the ONLY vocabulary the interpretation LLM
// call is allowed to choose from — it is never given the freedom to name an
// arbitrary function or invent a new one. Keep this in sync with the actual
// exported functions in copilotTools.ts; the route layer (Phase 4) maps each
// of these names to one or more real calls into that file.
// ---------------------------------------------------------------------------
export const COPILOT_TOOLS = [
  'employee_comparison',
  'employees_needing_attention',
  'sku_ranking',
  'division_summary',
  'management_attention_items',
  'wastage',
  'b2b_ranking',
  'b2b_summary',
  'unsupported',
] as const;
export type CopilotTool = (typeof COPILOT_TOOLS)[number];

/**
 * The actual param documentation the interpretation LLM sees. This MUST be
 * real prompt text, not a TypeScript comment next to the enum above — a
 * comment is invisible to the model at runtime (a bug caught in Step 4's own
 * live test: "Compare Ahmed with his division" correctly picked
 * employee_comparison but produced no employeeName param, because the model
 * was never actually told that field name existed).
 */
const TOOL_DESCRIPTIONS: Record<CopilotTool, string> = {
  employee_comparison: `employee_comparison — "who has the highest/lowest true efficiency", "compare X with their division". params: { "employeeName": "<name as the user wrote it, e.g. 'Ahmed'>" }. employeeName is REQUIRED — never call this tool without it.`,
  employees_needing_attention: `employees_needing_attention — "which employee needs attention". params: {} (no params).`,
  sku_ranking: `sku_ranking — "highest contribution/revenue/units SKU", optionally in a division. params: { "division": "<real division name, omit if not given>", "metric": "contribution" | "revenue" | "units" (default "contribution" if not specified) }.`,
  division_summary: `division_summary — "which division sells the most", "division totals". params: {} (no params).`,
  management_attention_items: `management_attention_items — "biggest issues management should look at", "what needs attention". params: { "scenario": "actuals" | "gmTargetPlan" | "efficiencyCase" | "expansionCase" (omit for actuals), "granularity": "month" | "quarter" | "ytd" (omit for month), "month": "<3-letter month, e.g. 'Jul'>", "quarter": "<e.g. 'Q4'>" } — omit any field not mentioned by the user.`,
  wastage: `wastage — "what is driving our wastage", "wastage %", "wastage cost". Same params as management_attention_items.`,
  b2b_ranking: `b2b_ranking — "highest delivery commitment client", "highest collection exposure client", "best margin client". params: { "metric": "deliveryCommitment" | "collectionExposure" | "revenue" | "margin" (default "revenue" if not specified) }.`,
  b2b_summary: `b2b_summary — "how are we doing with B2B overall", company-wide B2B summary. params: {} (no params).`,
  unsupported: `unsupported — the question doesn't map to any tool above. params: {} (no params).`,
};

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

Available tools (choose exactly one) — each line names the tool, when to use it, and the EXACT param field names it expects:
${COPILOT_TOOLS.map((t) => `- ${TOOL_DESCRIPTIONS[t]}`).join('\n')}

Rules:
- Use the exact param field names shown above — do not invent your own field names or omit a REQUIRED param.
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
  return getOpenAiApiKey() !== null;
}

export async function interpretQuestion(
  question: string,
  viewContext: CopilotViewContext,
  history: ConversationTurn[],
): Promise<InterpretOutcome> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "Grandiose Copilot isn't configured yet. Add an OpenAI API key in Settings." };
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
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: MODEL,
      instructions: INTERPRET_SYSTEM_PROMPT,
      input: userInput,
    });

    const cleaned = stripFences(extractFinalText(response));

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
    console.error('Copilot interpretQuestion failed:', redactKeyFragments(err));
    return { ok: false, reason: 'error', message: 'Copilot could not process that question — check the OpenAI API key in Settings and try again.' };
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
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "Grandiose Copilot isn't configured yet. Add an OpenAI API key in Settings." };
  }

  const userInput = `Question: ${question}\n\nTool used: ${toolName}\n\nVerified data (the only source of numbers you may use):\n${JSON.stringify(verifiedResult)}`;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: MODEL,
      instructions: EXPLAIN_SYSTEM_PROMPT,
      input: userInput,
    });

    const text = extractFinalText(response).trim();
    if (!text) return { ok: false, reason: 'error', message: 'Copilot had nothing to add here.' };
    return { ok: true, text };
  } catch (err) {
    console.error('Copilot explainResult failed:', redactKeyFragments(err));
    return { ok: false, reason: 'error', message: 'Copilot could not explain that result — check the OpenAI API key in Settings and try again.' };
  }
}
