// AI Presentation Builder — Step 4: the narrative engine. This is the ONLY
// place Claude ever sees real numbers, and even then only as a flat
// dictionary of pre-verified, pre-rounded {{token}} → value pairs built
// from presentationData.ts/copilotTools.ts results — never a raw
// spreadsheet, never something it could recompute or embellish. Claude's
// job here is strictly wording: pick which verified figures matter for this
// slide's purpose, and write around them using ONLY {{token}} placeholders
// for every number, percentage, or currency figure. It is never allowed to
// type a digit directly — validateSlideText() below rejects any response
// that contains a bare digit outside a resolved token, and
// substituteTokens() rejects any token that isn't in the dictionary handed
// to it. This is the "reject/regenerate/remove" safeguard the spec calls
// for (§ hallucination safeguards): one retry with the specific error fed
// back, then a fully deterministic, Claude-free fallback sentence — the
// chart on the slide (Step 5/6) still carries the real numbers regardless
// of whether the prose narrative succeeds.
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from './settings.ts';
import type { EmployeeSession } from '../auth.ts';
import {
  getManagementAttentionItems,
  getSkuRanking,
  getDivisionSummary,
  getB2BClientRanking,
  getB2BSummary,
  getEmployeesNeedingAttention,
  type AttentionQuery,
  type ToolResult,
  type SkuMetric,
  type B2BRankMetric,
} from './copilotTools.ts';
import { getWastageBreakdown, getPerformanceTrend, getOptimizationSnapshot, getLatestRiskResearch, type TrendMetric } from './presentationData.ts';
import { DIVISIONS, type Division } from '../../src/data/skuData.ts';
import type { PresentationPlan, PlannedSlide, DataCategoryId } from './presentationPlanner.ts';
import { DATA_CATEGORY_CATALOG } from './presentationPlanner.ts';

// ---------------------------------------------------------------------------
// Category → data-fetch dispatch. The single place that turns a plan's
// {id, params} into a real ToolResult. Params coming back from the planner
// are never trusted as typed — every one is checked against a known-good
// set/range here, falling back to a sensible default rather than passing an
// arbitrary string through to a query function.
// ---------------------------------------------------------------------------
function isSkuMetric(v: unknown): v is SkuMetric {
  return v === 'contribution' || v === 'revenue' || v === 'units';
}
function isB2BMetric(v: unknown): v is B2BRankMetric {
  return v === 'deliveryCommitment' || v === 'collectionExposure' || v === 'revenue' || v === 'margin';
}
function isDivision(v: unknown): v is Division {
  return typeof v === 'string' && (DIVISIONS as readonly string[]).includes(v);
}
function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}
function isTrendMetric(id: DataCategoryId): id is 'trend_food_cost' | 'trend_wastage' | 'trend_margin' | 'trend_cost_unit' {
  return id === 'trend_food_cost' || id === 'trend_wastage' || id === 'trend_margin' || id === 'trend_cost_unit';
}
const TREND_METRIC_BY_CATEGORY: Record<'trend_food_cost' | 'trend_wastage' | 'trend_margin' | 'trend_cost_unit', TrendMetric> = {
  trend_food_cost: 'foodCost',
  trend_wastage: 'wastage',
  trend_margin: 'margin',
  trend_cost_unit: 'costUnit',
};

async function fetchCategoryData(
  id: DataCategoryId,
  params: Record<string, unknown> | undefined,
  session: EmployeeSession,
  commandCenterQuery: AttentionQuery,
): Promise<ToolResult<unknown>> {
  if (isTrendMetric(id)) return getPerformanceTrend(TREND_METRIC_BY_CATEGORY[id]);

  switch (id) {
    case 'command_center_attention':
      return getManagementAttentionItems(commandCenterQuery);
    case 'wastage_breakdown':
      return getWastageBreakdown(commandCenterQuery);
    case 'sku_ranking': {
      const metric = isSkuMetric(params?.metric) ? params.metric : 'contribution';
      const division = isDivision(params?.division) ? params.division : null;
      const limit = isPositiveInt(params?.limit) ? params.limit : 5;
      return getSkuRanking(division, metric, limit);
    }
    case 'sku_division_summary':
      return getDivisionSummary();
    case 'b2b_ranking': {
      const metric = isB2BMetric(params?.metric) ? params.metric : 'revenue';
      const limit = isPositiveInt(params?.limit) ? params.limit : 5;
      return getB2BClientRanking(metric, limit);
    }
    case 'b2b_summary':
      return getB2BSummary();
    case 'employee_attention':
      return getEmployeesNeedingAttention(session);
    case 'optimization_snapshot':
      return getOptimizationSnapshot();
    case 'ai_risk_research': {
      const material = typeof params?.material === 'string' ? params.material : undefined;
      return getLatestRiskResearch(material);
    }
  }
}

// ---------------------------------------------------------------------------
// Token dictionary — flattens one or more category results into
// "categoryId.path.to.leaf" → value entries. Only leaves (string/number/
// boolean) are substitutable; a token pointing at an array or object is
// treated as unresolved, since there is no single value to print for it.
// ---------------------------------------------------------------------------
type TokenContext = Record<string, unknown>;

function flatten(value: unknown, prefix: string, out: TokenContext): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = `${prefix}.${k}`;
      out[key] = v;
      flatten(v, key, out);
    }
  } else {
    out[prefix] = value;
  }
}

function formatAed(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}AED ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}AED ${(abs / 1_000).toFixed(0)}K`;
  return `${sign}AED ${abs.toLocaleString('en-AE')}`;
}

/** Business-friendly formatting (spec §: AED 1.24M, AED 245K, 3.2%, 1,250 units) keyed off the token's own path — a heuristic, not a schema, since the token dictionary is assembled from several independently-shaped tool results. */
function formatToken(path: string, value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const lower = path.toLowerCase();
  if (lower.includes('pct') || lower.includes('percent')) return `${value.toFixed(1)}%`;
  if (lower.includes('aed') || lower.includes('cost') || lower.includes('revenue') || lower.includes('exposure') || lower.includes('receivable') || lower.includes('margin_aed')) {
    return formatAed(value);
  }
  if (Number.isInteger(value)) return value.toLocaleString('en-AE');
  return value.toLocaleString('en-AE', { maximumFractionDigits: 2 });
}

const TOKEN_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

function substituteTokens(text: string, context: TokenContext): { text: string; unresolvedTokens: string[] } {
  const unresolvedTokens: string[] = [];
  const substituted = text.replace(TOKEN_PATTERN, (whole, path: string) => {
    if (!(path in context)) {
      unresolvedTokens.push(path);
      return whole;
    }
    const formatted = formatToken(path, context[path]);
    if (formatted === null) {
      unresolvedTokens.push(path);
      return whole;
    }
    return formatted;
  });
  return { text: substituted, unresolvedTokens };
}

/** A digit outside any {{token}} span means Claude typed a number directly instead of using the dictionary — reject regardless of whether every token also resolved. */
function hasBareNumericClaim(text: string): boolean {
  return /\d/.test(text.replace(TOKEN_PATTERN, ''));
}

function validateSlideText(text: string, context: TokenContext): { ok: true; resolved: string } | { ok: false; reason: string } {
  if (hasBareNumericClaim(text)) return { ok: false, reason: `Wrote a number directly instead of a {{token}}: "${text}"` };
  const { text: resolved, unresolvedTokens } = substituteTokens(text, context);
  if (unresolvedTokens.length > 0) return { ok: false, reason: `Referenced unknown token(s): ${unresolvedTokens.join(', ')} in "${text}"` };
  return { ok: true, resolved };
}

// ---------------------------------------------------------------------------
// Per-slide narrative result.
// ---------------------------------------------------------------------------
export interface NarrativeSlide {
  order: number;
  layout: PlannedSlide['layout'];
  title: string;
  bullets: string[];
  /** "Based on: ..." line — the real source strings from every ok() result this slide drew on. */
  sources: string[];
  isDemoData: boolean;
  /** true when every category this slide needed came back ok(); false means the slide is honestly showing a data-unavailable notice rather than fabricated content. */
  dataAvailable: boolean;
  /** Raw verified data for Step 5 (chart generation) — the chart is built straight from this, independent of whether the prose narrative below resolved cleanly. */
  categoryData: { id: DataCategoryId; label: string; data: unknown }[];
}

const FALLBACK_MAX_ATTEMPTS = 2; // one initial attempt + one corrective retry, per the spec's reject/regenerate/remove rule

interface ClaudeSlideResponse {
  title?: unknown;
  bullets?: unknown;
}

async function callClaudeForSlide(
  client: Anthropic,
  slide: PlannedSlide,
  context: TokenContext,
  extraSystemNote: string,
): Promise<{ ok: true; title: string; bullets: string[] } | { ok: false; reason: string }> {
  const tokenLines = Object.entries(context)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `{{${k}}} = ${typeof v === 'string' ? `"${v}"` : v}`)
    .join('\n');

  const system = `You write one slide of a management presentation for Grandiose Bakery (UAE bakery/catering division). You are given the slide's purpose and a fixed dictionary of verified data tokens — these are the ONLY facts you may state.

Rules (violating any of these gets your response rejected and regenerated):
1. Every number, percentage, or currency figure you write MUST be a {{token}} from the list below, copied exactly (including dots). NEVER type a digit yourself.
2. Never reference a token that is not in the list below.
3. Write a short, insight-led title (e.g. "Viennoiserie drives the largest share of wastage") ONLY if the data clearly supports one specific finding; otherwise keep the title at the topic level (e.g. "Wastage Performance by Division").
4. Write 2-4 short bullet sentences: what happened, why it matters, using only the given tokens. Keep them management-readable, not a raw data dump.
5. Never use judgmental language about individual employees (no "worst", "best", "failing") — describe gaps and thresholds instead.
${extraSystemNote}

Available tokens:
${tokenLines || '(none — this slide has no verified data; write a brief note that this section could not be generated)'}

Respond with STRICT JSON only, no markdown fences, no commentary:
{ "title": "...", "bullets": ["...", "..."] }`;

  const userMessage = `Slide purpose: ${slide.purpose}\nLayout: ${slide.layout}\nWorking title (may replace): ${slide.workingTitle}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
    const rawText = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '');

    let parsed: ClaudeSlideResponse;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: 'Response was not valid JSON.' };
    }
    if (typeof parsed.title !== 'string' || !Array.isArray(parsed.bullets) || !parsed.bullets.every((b) => typeof b === 'string')) {
      return { ok: false, reason: 'Response did not match the required { title, bullets } shape.' };
    }
    return { ok: true, title: parsed.title, bullets: parsed.bullets as string[] };
  } catch (err) {
    // Same empirically-verified-clean Anthropic error shape as anthropicInterpreter.ts/presentationPlanner.ts.
    return { ok: false, reason: `Anthropic call failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Claude-free fallback when both attempts fail validation — honest and generic rather than blocking the deck, since the chart (Step 5/6) still shows the real numbers regardless. */
function deterministicFallback(slide: PlannedSlide, categoryLabels: string[]): { title: string; bullets: string[] } {
  return {
    title: slide.workingTitle,
    bullets: [
      categoryLabels.length > 0
        ? `See the ${categoryLabels.join(' / ')} chart on this slide for the verified figures.`
        : 'Verified figures for this section are shown on the chart.',
    ],
  };
}

async function narrateDataSlide(client: Anthropic | null, slide: PlannedSlide, context: TokenContext, categoryLabels: string[]): Promise<{ title: string; bullets: string[] }> {
  if (!client) return deterministicFallback(slide, categoryLabels);

  let lastReason = '';
  for (let attempt = 1; attempt <= FALLBACK_MAX_ATTEMPTS; attempt++) {
    const extraNote = attempt === 1 ? '' : `\nIMPORTANT — your previous attempt was rejected: ${lastReason}. Fix this and only use tokens from the list below.`;
    const response = await callClaudeForSlide(client, slide, context, extraNote);
    if (!response.ok) {
      lastReason = response.reason;
      continue;
    }
    const titleCheck = validateSlideText(response.title, context);
    if (!titleCheck.ok) {
      lastReason = titleCheck.reason;
      continue;
    }
    const bulletChecks = response.bullets.map((b) => validateSlideText(b, context));
    const failed = bulletChecks.find((c) => !c.ok);
    if (failed && !failed.ok) {
      lastReason = failed.reason;
      continue;
    }
    return { title: titleCheck.resolved, bullets: bulletChecks.map((c) => (c as { ok: true; resolved: string }).resolved) };
  }
  return deterministicFallback(slide, categoryLabels);
}

// ---------------------------------------------------------------------------
// Orchestrator — narrates every slide in a plan. Data-bearing slides fetch
// real data first; non-data layouts (title/recommendations/sources) are
// handled after, once every data slide's verified context is known, so the
// executive summary and recommendations can honestly reference headline
// figures already shown elsewhere in the deck.
// ---------------------------------------------------------------------------
export interface NarrativeRequest {
  plan: PresentationPlan;
  session: EmployeeSession;
  /** Applied to every Command Center / Performance Tracker category in this deck, so the same period is used throughout and numbers reconcile slide to slide (spec requirement). Defaults to Command Center's own defaults when omitted. */
  commandCenterQuery?: AttentionQuery;
}

export interface NarrativeResult {
  slides: NarrativeSlide[];
  generatedAt: string;
}

export async function buildPresentationNarrative(request: NarrativeRequest): Promise<NarrativeResult> {
  const { plan, session } = request;
  const commandCenterQuery = request.commandCenterQuery ?? {};
  const apiKey = getAnthropicApiKey();
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const dataSlides: PlannedSlide[] = [];
  const structuralSlides: PlannedSlide[] = [];
  for (const s of plan.slides) {
    if (s.layout === 'title_exec_summary' || s.layout === 'recommendations' || s.layout === 'sources_methodology') structuralSlides.push(s);
    else dataSlides.push(s);
  }

  const narrated: NarrativeSlide[] = [];
  const allSources = new Set<string>();
  let anyDemoData = false;

  // --- Pass 1: data-bearing slides -----------------------------------------
  for (const slide of dataSlides) {
    const context: TokenContext = {};
    const categoryData: NarrativeSlide['categoryData'] = [];
    const categoryLabels: string[] = [];
    const slideSources: string[] = []; // this slide's own sources, kept separate from the deck-wide `allSources` accumulator below
    let dataAvailable = true;
    let slideIsDemoData = false;

    for (const cat of slide.categories) {
      const result = await fetchCategoryData(cat.id, cat.params, session, commandCenterQuery);
      const label = DATA_CATEGORY_CATALOG[cat.id].label;
      if (!result.ok) {
        dataAvailable = false;
        continue;
      }
      flatten(result.data, cat.id, context);
      categoryData.push({ id: cat.id, label, data: result.data });
      categoryLabels.push(label);
      slideSources.push(result.source);
      allSources.add(result.source);
      if (typeof (result.data as { isDemoData?: unknown }).isDemoData === 'boolean' && (result.data as { isDemoData: boolean }).isDemoData) {
        slideIsDemoData = true;
        anyDemoData = true;
      }
    }

    if (categoryData.length === 0) {
      narrated.push({
        order: slide.order,
        layout: slide.layout,
        title: slide.workingTitle,
        bullets: [`This section could not be generated — the underlying data (${slide.categories.map((c) => DATA_CATEGORY_CATALOG[c.id].label).join(', ')}) is not currently available.`],
        sources: [],
        isDemoData: false,
        dataAvailable: false,
        categoryData: [],
      });
      continue;
    }

    const { title, bullets } = await narrateDataSlide(client, slide, context, categoryLabels);
    narrated.push({
      order: slide.order,
      layout: slide.layout,
      title,
      bullets,
      sources: [...new Set(slideSources)],
      isDemoData: slideIsDemoData,
      dataAvailable,
      categoryData,
    });
  }

  // --- Pass 2: structural slides (title, recommendations, sources) --------
  const deckContext: TokenContext = {};
  for (const s of narrated) {
    for (const c of s.categoryData) flatten(c.data, c.id, deckContext);
  }

  for (const slide of structuralSlides) {
    if (slide.layout === 'sources_methodology') {
      const sourceList = Array.from(allSources);
      narrated.push({
        order: slide.order,
        layout: slide.layout,
        title: 'Data Sources & Methodology',
        bullets: [
          sourceList.length > 0 ? `Data sources: ${sourceList.join('; ')}.` : 'No verified data sources were available for this presentation.',
          `Reporting period basis: ${commandCenterQuery.scenario ?? 'actuals'} · ${commandCenterQuery.granularity ?? 'month'}${commandCenterQuery.month ? ` (${commandCenterQuery.month})` : ''}.`,
          `Generated: ${new Date().toISOString()}.`,
          ...(anyDemoData ? ['ILLUSTRATIVE / DEMO DATA: one or more sections in this presentation used illustrative or demo data rather than a custom scenario — see the relevant slide.'] : []),
        ],
        sources: sourceList,
        isDemoData: anyDemoData,
        dataAvailable: true,
        categoryData: [],
      });
      continue;
    }

    if (slide.layout === 'recommendations') {
      const { title, bullets } = await narrateDataSlide(
        client,
        slide,
        deckContext,
        [],
      );
      narrated.push({
        order: slide.order,
        layout: slide.layout,
        title,
        bullets: bullets.map((b) => `Recommendation: ${b}`),
        sources: Array.from(allSources),
        isDemoData: anyDemoData,
        dataAvailable: true,
        categoryData: [],
      });
      continue;
    }

    // title_exec_summary
    const { title, bullets } = client
      ? await narrateDataSlide(client, { ...slide, purpose: `Opening/executive-summary slide for a presentation with objective: ${plan.objective}` }, deckContext, [])
      : deterministicFallback(slide, []);
    narrated.push({
      order: slide.order,
      layout: slide.layout,
      title: title || plan.objective,
      bullets: bullets.length > 0 ? bullets : [plan.objective],
      sources: [],
      isDemoData: false,
      dataAvailable: true,
      categoryData: [],
    });
  }

  narrated.sort((a, b) => a.order - b.order);
  return { slides: narrated, generatedAt: new Date().toISOString() };
}
