// AI Risk Intelligence — 5th Scenario & Resilience module. Live web research
// via OpenAI's Responses API (web_search tool), server-side only.
//
// Rule 1 (no manufactured sources): citedSources/allSources below are built
// ONLY from the API response's own annotation/action.sources fields — never
// from anything the model writes inside its JSON answer. The model is never
// asked to name a source, organisation, or date in that JSON; if it did, we
// wouldn't display it as a citation anyway, since the Sources panel reads
// only from these two extracted arrays.
//
// Rule 2 (no new math): this module never computes a financial/operational
// result. It proposes assumptions; scenarioCalc.ts's existing functions (used
// unmodified, from the frontend) turn assumptions into numbers.
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { db } from '../db.ts';
import { getAiRiskMonthlyCap, getOpenAiApiKey } from './settings.ts';
import { ALLOWED_DOMAINS } from './aiRiskDomains.ts';

export type TimeHorizon = '7d' | '30d' | '90d' | '6mo' | '12mo';
export type RiskType = 'All' | 'Commodity' | 'Geopolitical' | 'Supply Chain' | 'Logistics' | 'Supplier' | 'Climate' | 'Regulatory' | 'FX';
export type RawMaterialFilter = 'All' | 'Wheat-Flour' | 'Butter-Dairy' | 'Sugar' | 'Cocoa' | 'Nuts' | 'Oils' | 'Eggs' | 'Yeast' | 'Packaging';
export type ResearchDepth = 'quick' | 'standard' | 'detailed';
export type Geography = 'Global' | 'UAE' | 'GCC' | 'Europe' | 'Black Sea' | 'Asia';

export interface ResearchParams {
  question: string;
  horizon: TimeHorizon;
  riskType: RiskType;
  rawMaterial: RawMaterialFilter;
  depth: ResearchDepth;
  geography: Geography;
}

/** The only assumption parameters this module will ever propose — matches Stage-1's assumption -> function audit exactly. Two of the five have no backing scenarioCalc function (see AI_RISK_MODEL_STATUS below); they are still surfaced, per instruction, never dropped. */
export type AssumptionParam =
  | 'raw_material_cost_increase_pct'
  | 'lead_time_extension_days'
  | 'freight_premium_pct'
  | 'stockout_probability'
  | 'safety_stock_days';

export const ASSUMPTION_HAS_MODEL: Record<AssumptionParam, boolean> = {
  raw_material_cost_increase_pct: true, // computeInflationSensitivity
  lead_time_extension_days: true, // computeSupplyDisruption
  freight_premium_pct: false, // stored/displayed only — never read by computeSupplyDisruption (see MIGRATION-PROVENANCE.html "Known non-functional inputs")
  stockout_probability: true, // computeSupplyDisruption
  safety_stock_days: false, // Pandemic Preparedness's own threshold-flag input only — never reaches scenarioCalc.ts
};

export interface SuggestedAssumption {
  parameter: AssumptionParam;
  suggestedValue: number;
  rationale: string;
}

export interface SuggestedSpendMixRow {
  origin: string;
  sharePct: number;
}

export interface ActionPlan {
  now: string[];
  in30Days: string[];
  in90DaysPlus: string[];
}

export interface AiRiskResult {
  title: string;
  executiveSummary: string;
  whatIsHappening: string[];
  whyItMattersToGrandiose: string[];
  whatToWatch: string[];
  affectedMaterials: string[];
  horizon: string;
  confidence: 'low' | 'moderate' | 'high';
  overallRisk: 'low' | 'moderate' | 'high';
  suggestedAssumptions: SuggestedAssumption[];
  suggestedSpendMix?: SuggestedSpendMixRow[];
  actionPlan: ActionPlan;
}

export interface CitedSource {
  title: string;
  url: string;
}

export interface ResearchRecord {
  id: number;
  question: string;
  params: ResearchParams;
  result: AiRiskResult;
  citedSources: CitedSource[];
  allSources: string[];
  sourcesRetrieved: boolean;
  userAssumptions: SuggestedAssumption[] | null;
  createdByEmployeeId: string;
  createdAt: string;
}

interface RawResearchRow {
  id: number;
  question: string;
  params_json: string;
  params_hash: string;
  result_json: string;
  cited_sources_json: string;
  all_sources_json: string;
  user_assumptions_json: string | null;
  created_by_employee_id: string;
  created_at: string;
  status: string;
}

function toResearchRecord(row: RawResearchRow): ResearchRecord {
  const allSources: string[] = JSON.parse(row.all_sources_json);
  const result: AiRiskResult = JSON.parse(row.result_json);
  // Normalizes a record saved before these three fields were arrays — see
  // toBulletArray's own comment. sanitizeResult() already guarantees this
  // shape for anything saved from here on; this only protects reads of
  // whatever was already persisted under the old (string) shape.
  result.whatIsHappening = toBulletArray(result.whatIsHappening);
  result.whyItMattersToGrandiose = toBulletArray(result.whyItMattersToGrandiose);
  result.whatToWatch = toBulletArray(result.whatToWatch);
  return {
    id: row.id,
    question: row.question,
    params: JSON.parse(row.params_json),
    result,
    citedSources: JSON.parse(row.cited_sources_json),
    allSources,
    sourcesRetrieved: allSources.length > 0,
    userAssumptions: row.user_assumptions_json ? JSON.parse(row.user_assumptions_json) : null,
    createdByEmployeeId: row.created_by_employee_id,
    createdAt: row.created_at,
  };
}

// --- Caching (Rule 6a) ------------------------------------------------------

const FRESHNESS_HOURS: Record<ResearchDepth, number> = { quick: 6, standard: 24, detailed: 72 };

function canonicalParamsKey(params: ResearchParams): string {
  return JSON.stringify({
    question: params.question.trim().toLowerCase(),
    horizon: params.horizon,
    riskType: params.riskType,
    rawMaterial: params.rawMaterial,
    depth: params.depth,
    geography: params.geography,
  });
}

function hashParams(params: ResearchParams): string {
  return createHash('sha256').update(canonicalParamsKey(params)).digest('hex');
}

function findCached(paramsHash: string, depth: ResearchDepth): ResearchRecord | null {
  const cutoff = new Date(Date.now() - FRESHNESS_HOURS[depth] * 3_600_000).toISOString();
  const row = db
    .prepare(
      `SELECT * FROM ai_research WHERE params_hash = ? AND status = 'completed' AND created_at >= ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(paramsHash, cutoff) as unknown as RawResearchRow | undefined;
  return row ? toResearchRecord(row) : null;
}

// --- Spend control (Rule 6b/6c) ---------------------------------------------

function getMonthlyUsageCount(): number {
  const row = db.prepare(`SELECT COUNT(*) as n FROM ai_usage WHERE strftime('%Y-%m', searched_at) = strftime('%Y-%m', 'now')`).get() as {
    n: number;
  };
  return row.n;
}

function getUserRecentCount(employeeId: string): number {
  const cutoff = new Date(Date.now() - 3_600_000).toISOString();
  const row = db.prepare(`SELECT COUNT(*) as n FROM ai_usage WHERE employee_id = ? AND searched_at >= ?`).get(employeeId, cutoff) as {
    n: number;
  };
  return row.n;
}

const PER_USER_HOURLY_LIMIT = 10;
const ESTIMATED_SEARCHES: Record<ResearchDepth, number> = { quick: 1, standard: 1, detailed: 2 };
const SEARCH_CONTEXT_SIZE: Record<ResearchDepth, 'low' | 'medium' | 'high'> = { quick: 'low', standard: 'medium', detailed: 'high' };

function recordUsage(employeeId: string, depth: ResearchDepth): void {
  db.prepare(`INSERT INTO ai_usage (employee_id, searched_at, depth, estimated_searches) VALUES (?, ?, ?, ?)`).run(
    employeeId,
    new Date().toISOString(),
    depth,
    ESTIMATED_SEARCHES[depth],
  );
}

export interface UsageStats {
  usedThisMonth: number;
  monthlyCap: number;
  topUsers: { employeeId: string; count: number }[];
}

export function getUsageStats(): UsageStats {
  const topUsers = db
    .prepare(
      `SELECT employee_id as employeeId, COUNT(*) as count FROM ai_usage
       WHERE strftime('%Y-%m', searched_at) = strftime('%Y-%m', 'now')
       GROUP BY employee_id ORDER BY count DESC LIMIT 5`,
    )
    .all() as { employeeId: string; count: number }[];
  return { usedThisMonth: getMonthlyUsageCount(), monthlyCap: getAiRiskMonthlyCap(), topUsers };
}

// --- OpenAI call -------------------------------------------------------------

const SYSTEM_INSTRUCTIONS = `You are a supply-chain and commodity-risk research analyst for Grandiose Bakery, a UAE bakery business. Use the web_search tool to find live, current information relevant to the question and filters given. Ground every claim in what you actually find via search — do not rely on general knowledge alone for anything time-sensitive (prices, current events, recent regulatory changes).

After researching, respond with STRICT JSON only, no markdown fences, no commentary outside the JSON, matching exactly this shape:
{
  "title": "short descriptive title for this research",
  "executiveSummary": "2-3 sentence summary",
  "whatIsHappening": ["2-4 concise bullet points, each a distinct point — not full paragraphs"],
  "whyItMattersToGrandiose": ["2-4 concise bullet points, specific to a bakery business"],
  "whatToWatch": ["2-4 concise bullet points, each one leading indicator to monitor"],
  "affectedMaterials": ["short raw-material names, only ones genuinely implicated"],
  "horizon": "restate the time horizon you were given",
  "confidence": "low" | "moderate" | "high",
  "overallRisk": "low" | "moderate" | "high",
  "suggestedAssumptions": [
    {
      "parameter": "raw_material_cost_increase_pct" | "lead_time_extension_days" | "freight_premium_pct" | "stockout_probability" | "safety_stock_days",
      "suggestedValue": number,
      "rationale": "one sentence, grounded in what you found"
    }
  ],
  "suggestedSpendMix": [ { "origin": "country or region name", "sharePct": number } ],
  "actionPlan": {
    "now": ["concrete action for the next 0-7 days, grounded in this research"],
    "in30Days": ["concrete action for the next 30 days"],
    "in90DaysPlus": ["concrete action for 90+ days out"]
  }
}

Only include a "parameter" entry when your research actually gives you a defensible basis for a number — do not invent values with no grounding. Only include "suggestedSpendMix" when the research specifically concerns supplier or country-of-origin concentration; omit the field entirely otherwise. Every actionPlan list should have at least one entry; if you have nothing concrete for a horizon, say "No specific action indicated by this research" rather than inventing one. Do not name, invent, or restate any source, publication, organisation, or date inside this JSON — source attribution is handled separately from your search results, not from this text. Do not include a materials-to-division mapping or any per-division breakdown; that information does not exist in this system and must not be inferred.`;

function buildUserInput(params: ResearchParams): string {
  return [
    `Question: ${params.question}`,
    `Time horizon: ${params.horizon}`,
    `Risk type filter: ${params.riskType}`,
    `Raw material filter: ${params.rawMaterial}`,
    `Geography filter: ${params.geography}`,
    `Research depth: ${params.depth}`,
  ].join('\n');
}

function extractCitedSources(response: OpenAI.Responses.Response): CitedSource[] {
  const seen = new Map<string, CitedSource>();
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const content of item.content) {
      if (content.type !== 'output_text') continue;
      for (const ann of content.annotations ?? []) {
        if (ann.type === 'url_citation' && !seen.has(ann.url)) {
          seen.set(ann.url, { title: ann.title, url: ann.url });
        }
      }
    }
  }
  return [...seen.values()];
}

function extractAllSources(response: OpenAI.Responses.Response): string[] {
  const seen = new Set<string>();
  for (const item of response.output) {
    if (item.type !== 'web_search_call') continue;
    const action = item.action as { type: string; sources?: { url: string }[] };
    if (action?.type === 'search' && action.sources) {
      for (const s of action.sources) seen.add(s.url);
    }
  }
  return [...seen];
}

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

const VALID_PARAMETERS = new Set<AssumptionParam>([
  'raw_material_cost_increase_pct',
  'lead_time_extension_days',
  'freight_premium_pct',
  'stockout_probability',
  'safety_stock_days',
]);

function sanitizeStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
}

function sanitizeActionPlan(v: unknown): ActionPlan {
  const r = (v ?? {}) as Partial<ActionPlan>;
  const now = sanitizeStringList(r.now);
  const in30Days = sanitizeStringList(r.in30Days);
  const in90DaysPlus = sanitizeStringList(r.in90DaysPlus);
  const fallback = ['No specific action indicated by this research.'];
  return {
    now: now.length > 0 ? now : fallback,
    in30Days: in30Days.length > 0 ? in30Days : fallback,
    in90DaysPlus: in90DaysPlus.length > 0 ? in90DaysPlus : fallback,
  };
}

/** Handles both a genuinely-array response (the normal case, per the current
 * prompt) and a legacy single-string value — a research record saved before
 * these three fields were arrays still has the old shape in result_json
 * forever (toResearchRecord() never re-validates a stored row), so this same
 * helper runs on both the write path (sanitizeResult, below) and the read
 * path (toResearchRecord) to guarantee every consumer always sees string[],
 * regardless of when the record was created. */
function toBulletArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (typeof value === 'string' && value.trim() !== '') return [value];
  return [];
}

function sanitizeResult(raw: unknown): AiRiskResult {
  const r = raw as Partial<AiRiskResult> & Record<string, unknown>;
  const suggestedAssumptions = Array.isArray(r.suggestedAssumptions)
    ? r.suggestedAssumptions.filter(
        (a): a is SuggestedAssumption =>
          !!a && VALID_PARAMETERS.has(a.parameter) && typeof a.suggestedValue === 'number' && typeof a.rationale === 'string',
      )
    : [];
  const suggestedSpendMix = Array.isArray(r.suggestedSpendMix)
    ? r.suggestedSpendMix.filter((row): row is SuggestedSpendMixRow => !!row && typeof row.origin === 'string' && typeof row.sharePct === 'number')
    : undefined;

  return {
    title: typeof r.title === 'string' ? r.title : 'Untitled research',
    executiveSummary: typeof r.executiveSummary === 'string' ? r.executiveSummary : '',
    whatIsHappening: toBulletArray(r.whatIsHappening),
    whyItMattersToGrandiose: toBulletArray(r.whyItMattersToGrandiose),
    whatToWatch: toBulletArray(r.whatToWatch),
    affectedMaterials: Array.isArray(r.affectedMaterials) ? r.affectedMaterials.filter((m) => typeof m === 'string') : [],
    horizon: typeof r.horizon === 'string' ? r.horizon : '',
    confidence: r.confidence === 'low' || r.confidence === 'moderate' || r.confidence === 'high' ? r.confidence : 'low',
    overallRisk: r.overallRisk === 'low' || r.overallRisk === 'moderate' || r.overallRisk === 'high' ? r.overallRisk : 'low',
    suggestedAssumptions,
    ...(suggestedSpendMix && suggestedSpendMix.length > 0 ? { suggestedSpendMix } : {}),
    actionPlan: sanitizeActionPlan(r.actionPlan),
  };
}

export function isOpenAiConfigured(): boolean {
  return getOpenAiApiKey() !== null;
}

export type RunResearchOutcome =
  | { ok: true; research: ResearchRecord; cached: boolean }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'monthly_cap'; message: string }
  | { ok: false; reason: 'rate_limit'; message: string; retryAfterSeconds: number }
  | { ok: false; reason: 'error'; message: string };

export async function runResearch(params: ResearchParams, employeeId: string, forceRefresh: boolean): Promise<RunResearchOutcome> {
  const paramsHash = hashParams(params);

  if (!forceRefresh) {
    const cached = findCached(paramsHash, params.depth);
    if (cached) return { ok: true, research: cached, cached: true };
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "Live research isn't configured yet. Add an OpenAI API key in Settings." };
  }

  const monthlyCap = getAiRiskMonthlyCap();
  if (getMonthlyUsageCount() >= monthlyCap) {
    return { ok: false, reason: 'monthly_cap', message: 'Monthly research limit reached — contact your administrator.' };
  }

  const recentCount = getUserRecentCount(employeeId);
  if (recentCount >= PER_USER_HOURLY_LIMIT) {
    return {
      ok: false,
      reason: 'rate_limit',
      message: `You've reached the limit of ${PER_USER_HOURLY_LIMIT} searches per hour. Try again in a few minutes.`,
      retryAfterSeconds: 3600,
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: 'gpt-5.5',
      instructions: SYSTEM_INSTRUCTIONS,
      input: buildUserInput(params),
      tools: [
        {
          type: 'web_search',
          filters: { allowed_domains: [...ALLOWED_DOMAINS] },
          search_context_size: SEARCH_CONTEXT_SIZE[params.depth],
        },
      ],
      include: ['web_search_call.action.sources'],
    });

    const citedSources = extractCitedSources(response);
    const allSources = extractAllSources(response);

    let cleaned = extractFinalText(response).trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: 'error', message: "The research response couldn't be parsed as structured data. Try again." };
    }
    const result = sanitizeResult(parsed);

    const now = new Date().toISOString();
    const insertResult = db
      .prepare(
        `INSERT INTO ai_research
          (question, params_json, params_hash, result_json, cited_sources_json, all_sources_json, created_by_employee_id, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      )
      .run(
        params.question,
        JSON.stringify(params),
        paramsHash,
        JSON.stringify(result),
        JSON.stringify(citedSources),
        JSON.stringify(allSources),
        employeeId,
        now,
      );

    recordUsage(employeeId, params.depth);

    const row = db.prepare('SELECT * FROM ai_research WHERE id = ?').get(insertResult.lastInsertRowid) as unknown as RawResearchRow;
    return { ok: true, research: toResearchRecord(row), cached: false };
  } catch (err) {
    // Leak shape here: OpenAI's own SDK error messages echo a
    // masked-but-still-partial fragment of the submitted key (e.g.
    // "sk-fake-****...tion") — an exact string match against `apiKey` can't
    // catch that, since OpenAI masks it before the message ever reaches this
    // code. Pattern-match anything key-shaped instead, so the server log
    // carries the same "never a secret, not even a fragment" guarantee as
    // the fixed client message below.
    //
    // This is NOT the same shape every provider has — see email.ts, where
    // Nodemailer can echo the literal, unmasked app password (an exact-match
    // replace is correct and sufficient there), and anthropicInterpreter.ts,
    // whose auth-error format carries no key material at all (checked
    // empirically, not assumed — no redaction needed there). A fourth
    // provider needs its own empirical check of its actual error shape
    // before assuming either technique here covers it.
    const raw = err instanceof Error ? err.message : String(err);
    const redacted = raw.replace(/sk-[A-Za-z0-9*_-]{6,}/g, '[redacted]');
    console.error('AI Risk research failed:', redacted);
    return { ok: false, reason: 'error', message: 'Could not complete research — check the OpenAI API key in Settings and try again.' };
  }
}

export function getResearch(id: number): ResearchRecord | null {
  const row = db.prepare('SELECT * FROM ai_research WHERE id = ?').get(id) as unknown as RawResearchRow | undefined;
  return row ? toResearchRecord(row) : null;
}

export function listResearch(): ResearchRecord[] {
  const rows = db.prepare('SELECT * FROM ai_research ORDER BY created_at DESC').all() as unknown as RawResearchRow[];
  return rows.map(toResearchRecord);
}

/** Saves the user's edited assumption values alongside the AI's originals (result_json is untouched) so the difference is auditable. */
export function saveUserAssumptions(id: number, assumptions: SuggestedAssumption[]): ResearchRecord | null {
  const existing = getResearch(id);
  if (!existing) return null;
  db.prepare('UPDATE ai_research SET user_assumptions_json = ? WHERE id = ?').run(JSON.stringify(assumptions), id);
  return getResearch(id);
}

// --- Watchlist ---------------------------------------------------------------

export interface WatchlistItem {
  id: number;
  risk: string;
  rawMaterial: string | null;
  geography: string | null;
  riskLevel: 'low' | 'moderate' | 'high';
  keyIndicator: string | null;
  lastResearchedAt: string | null;
  reviewDate: string | null;
  createdByEmployeeId: string;
  createdAt: string;
}

interface RawWatchlistRow {
  id: number;
  risk: string;
  raw_material: string | null;
  geography: string | null;
  risk_level: string;
  key_indicator: string | null;
  last_researched_at: string | null;
  review_date: string | null;
  created_by_employee_id: string;
  created_at: string;
}

function toWatchlistItem(row: RawWatchlistRow): WatchlistItem {
  return {
    id: row.id,
    risk: row.risk,
    rawMaterial: row.raw_material,
    geography: row.geography,
    riskLevel: row.risk_level as WatchlistItem['riskLevel'],
    keyIndicator: row.key_indicator,
    lastResearchedAt: row.last_researched_at,
    reviewDate: row.review_date,
    createdByEmployeeId: row.created_by_employee_id,
    createdAt: row.created_at,
  };
}

export interface WatchlistInput {
  risk: string;
  rawMaterial?: string | null;
  geography?: string | null;
  riskLevel: 'low' | 'moderate' | 'high';
  keyIndicator?: string | null;
  reviewDate?: string | null;
}

export function listWatchlist(): WatchlistItem[] {
  const rows = db.prepare('SELECT * FROM ai_watchlist ORDER BY created_at DESC').all() as unknown as RawWatchlistRow[];
  return rows.map(toWatchlistItem);
}

export function addWatchlistItem(input: WatchlistInput, employeeId: string): WatchlistItem {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO ai_watchlist (risk, raw_material, geography, risk_level, key_indicator, review_date, created_by_employee_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.risk, input.rawMaterial ?? null, input.geography ?? null, input.riskLevel, input.keyIndicator ?? null, input.reviewDate ?? null, employeeId, now);
  const row = db.prepare('SELECT * FROM ai_watchlist WHERE id = ?').get(result.lastInsertRowid) as unknown as RawWatchlistRow;
  return toWatchlistItem(row);
}

export function updateWatchlistItem(id: number, patch: Partial<WatchlistInput>): WatchlistItem | null {
  const existing = db.prepare('SELECT * FROM ai_watchlist WHERE id = ?').get(id) as unknown as RawWatchlistRow | undefined;
  if (!existing) return null;
  db.prepare(
    `UPDATE ai_watchlist SET risk = ?, raw_material = ?, geography = ?, risk_level = ?, key_indicator = ?, review_date = ? WHERE id = ?`,
  ).run(
    patch.risk ?? existing.risk,
    patch.rawMaterial !== undefined ? patch.rawMaterial : existing.raw_material,
    patch.geography !== undefined ? patch.geography : existing.geography,
    patch.riskLevel ?? existing.risk_level,
    patch.keyIndicator !== undefined ? patch.keyIndicator : existing.key_indicator,
    patch.reviewDate !== undefined ? patch.reviewDate : existing.review_date,
    id,
  );
  const row = db.prepare('SELECT * FROM ai_watchlist WHERE id = ?').get(id) as unknown as RawWatchlistRow;
  return toWatchlistItem(row);
}

export function deleteWatchlistItem(id: number): boolean {
  const result = db.prepare('DELETE FROM ai_watchlist WHERE id = ?').run(id);
  return result.changes > 0;
}
