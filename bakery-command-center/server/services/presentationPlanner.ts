// AI Presentation Builder — Step 3: the planning call. This is the ONLY
// place in the whole pipeline where Claude decides presentation STRUCTURE
// (how many slides, what each one is for, which layout, which verified-data
// category feeds it). It never sees a real number here — it only ever picks
// from a fixed catalog of data-category IDs the caller (the route, Step 7)
// has already computed as available for this session/data-source. That
// list is the enforcement point for role-based access (spec's "AI must only
// access data the logged-in user is authorized to access" / "enforced at
// the data/API layer, not just the frontend") — a category never offered
// here can never end up in a slide, however the objective is phrased.
//
// Narrative (Step 4) is the next stage: it takes each planned slide's
// category + params, calls the matching presentationData.ts/copilotTools.ts
// function to get the real, rounded numbers, and ONLY THEN lets Claude write
// sentences — via {{token}} substitution against that verified data, never
// free numeric generation. So a workingTitle or purpose produced here is
// provisional scaffolding, not a claim; it must never contain a number,
// percentage, or currency figure (validated below), because none has been
// verified yet at this stage.
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from './settings.ts';

// ---------------------------------------------------------------------------
// Fixed data-category catalog. The planner may only ever reference an id
// from here — never a free-form string — so a later stage can look the id
// up in one place (this same catalog) to know exactly which
// presentationData.ts/copilotTools.ts function answers it. Adding a new
// category means adding it here AND wiring it in presentationNarrative.ts;
// it can never appear in a plan just because Claude mentions it.
// ---------------------------------------------------------------------------
export type DataCategoryId =
  | 'command_center_attention'
  | 'wastage_breakdown'
  | 'trend_food_cost'
  | 'trend_wastage'
  | 'trend_margin'
  | 'trend_cost_unit'
  | 'sku_ranking'
  | 'sku_division_summary'
  | 'b2b_ranking'
  | 'b2b_summary'
  | 'employee_attention'
  | 'optimization_snapshot'
  | 'ai_risk_research';

export interface DataCategoryInfo {
  id: DataCategoryId;
  label: string;
  description: string;
  /** Human-readable note on what optional params this category accepts, shown to Claude as guidance only — presentationNarrative.ts still validates/clamps whatever comes back. */
  paramsHint?: string;
}

export const DATA_CATEGORY_CATALOG: Record<DataCategoryId, DataCategoryInfo> = {
  command_center_attention: {
    id: 'command_center_attention',
    label: 'Command Center — items needing attention',
    description: 'The current list of management attention flags (e.g. wastage above target, margin pressure) for a scenario/period.',
  },
  wastage_breakdown: {
    id: 'wastage_breakdown',
    label: 'Wastage — bakery-wide + division breakdown',
    description: 'Bakery-wide wastage % and cost vs. target, plus the six-division wastage breakdown. No per-SKU wastage exists — never request SKU-level wastage.',
  },
  trend_food_cost: { id: 'trend_food_cost', label: 'Food cost % trend', description: 'Month-by-month food cost % vs. target, from Performance Tracker.' },
  trend_wastage: { id: 'trend_wastage', label: 'Wastage % trend', description: 'Month-by-month wastage % trend, from Performance Tracker.' },
  trend_margin: { id: 'trend_margin', label: 'Margin % trend', description: 'Month-by-month gross margin % trend, from Performance Tracker.' },
  trend_cost_unit: { id: 'trend_cost_unit', label: 'Cost per unit trend', description: 'Month-by-month cost-per-unit trend, from Performance Tracker.' },
  sku_ranking: {
    id: 'sku_ranking',
    label: 'SKU ranking',
    description: 'Top SKUs ranked by contribution, revenue, or units, optionally filtered to one division.',
    paramsHint: 'metric: "contribution" | "revenue" | "units"; division: optional division name; limit: optional (default 5)',
  },
  sku_division_summary: { id: 'sku_division_summary', label: 'SKU division totals', description: 'Company-wide SKU/division summary totals.' },
  b2b_ranking: {
    id: 'b2b_ranking',
    label: 'B2B client ranking',
    description: 'Top B2B clients ranked by delivery commitment, collection exposure, revenue, or margin.',
    paramsHint: 'metric: "deliveryCommitment" | "collectionExposure" | "revenue" | "margin"; limit: optional (default 5)',
  },
  b2b_summary: { id: 'b2b_summary', label: 'B2B portfolio summary', description: 'Company-wide B2B summary and receivables position.' },
  employee_attention: {
    id: 'employee_attention',
    label: 'Employees needing attention',
    description: 'Employees ranked by the gap between their True Efficiency and their department average, scoped to what this session may view. Never phrase as "worst employee" — use "largest performance gap".',
  },
  optimization_snapshot: {
    id: 'optimization_snapshot',
    label: 'Optimization Lab — production-mix solver output',
    description: 'The actual solver result for current vs. optimized production mix. May be demo data if no custom scenario was supplied — this must be disclosed on the slide.',
  },
  ai_risk_research: {
    id: 'ai_risk_research',
    label: 'AI Risk Intelligence — latest research',
    description: 'The most recent AI Risk research record (optionally for one raw material) plus any linked Supplier Intelligence follow-up. Preserve external-source attribution and price classification verbatim.',
    paramsHint: 'material: optional raw-material filter matching an existing research record',
  },
};

// ---------------------------------------------------------------------------
// The eight reusable slide layouts from the spec. 'two_chart_comparison' and
// 'scenario_optimization_comparison' are the only layouts a slide may pair
// with two categories; every other data-bearing layout carries exactly one.
// ---------------------------------------------------------------------------
export type SlideLayout =
  | 'title_exec_summary'
  | 'kpi_chart_interpretation'
  | 'large_chart_finding'
  | 'two_chart_comparison'
  | 'table_insight'
  | 'recommendations'
  | 'scenario_optimization_comparison'
  | 'sources_methodology';

const LAYOUTS_ALLOWING_TWO_CATEGORIES: ReadonlySet<SlideLayout> = new Set(['two_chart_comparison', 'scenario_optimization_comparison']);
const LAYOUTS_REQUIRING_NO_CATEGORY: ReadonlySet<SlideLayout> = new Set(['title_exec_summary', 'recommendations', 'sources_methodology']);

export type PresentationStyle = 'executive_summary' | 'management_analysis' | 'detailed_review';

export const MIN_SLIDES = 4;
export const MAX_SLIDES = 16;

export interface PresentationPlanRequest {
  objective: string;
  slideCount: number;
  style: PresentationStyle;
  audience?: string;
  /** Computed by the caller from session role + data source — see file header. Only these ids may appear in the plan. */
  availableCategoryIds: DataCategoryId[];
}

export interface PlannedSlide {
  order: number;
  layout: SlideLayout;
  /** Provisional, topic-level only (e.g. "Wastage Performance vs. Target") — never a number. Narrative (Step 4) replaces this with a real insight-led title once data is verified, where the data supports one. */
  workingTitle: string;
  /** One sentence: the management question this slide answers. */
  purpose: string;
  categories: { id: DataCategoryId; params?: Record<string, unknown> }[];
}

export interface PresentationPlan {
  objective: string;
  audience: string | null;
  style: PresentationStyle;
  slides: PlannedSlide[];
}

export type PlanOutcome =
  | { ok: true; plan: PresentationPlan }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'invalid_request'; message: string }
  | { ok: false; reason: 'no_categories'; message: string }
  | { ok: false; reason: 'error'; message: string };

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey() !== null;
}

// A number, percent sign, or currency-looking token in a working title means
// Claude tried to state a figure before any data was verified — reject that
// slide's title rather than let an unverified number reach the deck, even
// provisionally. Falls back to the slide's own purpose sentence, which is
// deliberately about the QUESTION, not an answer.
const NUMERIC_CLAIM_PATTERN = /\d|%|AED|aed/;

function sanitizeWorkingTitle(title: string, purpose: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0 || NUMERIC_CLAIM_PATTERN.test(trimmed)) return purpose;
  return trimmed;
}

function buildSystemPrompt(availableCategories: DataCategoryInfo[]): string {
  const catalogLines = availableCategories.map((c) => `- ${c.id}: ${c.label} — ${c.description}${c.paramsHint ? ` (params: ${c.paramsHint})` : ''}`).join('\n');
  return `You are a presentation architect for Grandiose Bakery's management dashboard (a UAE bakery/catering division). Your ONLY job is to plan the STRUCTURE of a management presentation — you never see actual figures, and you must never write one into a title or purpose sentence. A later stage fetches the real, verified numbers and writes the actual narrative; you are building the skeleton it will fill in.

Think like a management consultant: what question is this presentation trying to answer, and what is the logical sequence of slides that answers it — not one slide per available data category. Only use a category genuinely relevant to the stated objective; do not pad the deck with irrelevant categories just because they are available.

You may reference ONLY these data categories (never invent an id, never use one not listed):
${catalogLines}

Available slide layouts, choose the one that fits each slide's content:
- title_exec_summary: opening slide — no data category
- kpi_chart_interpretation: one KPI + one chart + interpretation — exactly one category
- large_chart_finding: one large chart making one clear finding — exactly one category
- two_chart_comparison: two related charts side by side — exactly two categories
- table_insight: a small table plus a written insight — exactly one category
- recommendations: management recommendations slide — no data category (recommendations are written in the next stage, grounded only in the data already shown)
- scenario_optimization_comparison: current vs. optimized comparison — exactly two categories (typically optimization_snapshot paired with a relevant trend or command_center_attention)
- sources_methodology: closing slide naming data sources, reporting period, and generation timestamp — no data category

Rules:
1. The FIRST slide must be layout "title_exec_summary".
2. Include exactly one "recommendations" slide, near the end, unless the objective or style makes it clearly inappropriate (e.g. a pure data-sources request).
3. The LAST slide must be layout "sources_methodology".
4. The total slide count must exactly equal the requested count.
5. workingTitle must be a short topic phrase (e.g. "Wastage Performance vs. Target") — NEVER a number, percentage, or AED figure, because no data has been verified yet.
6. purpose is one sentence stating the management question the slide answers.
7. Respect the requested style: "executive_summary" = fewer, higher-level slides with minimal categories per slide; "management_analysis" = balanced depth; "detailed_review" = more granular, more category coverage.
8. If the objective asks for something no available category can support, build the best honest plan from what IS available rather than inventing a category — do not silently drop the objective's intent without adapting.

Respond with STRICT JSON only, no markdown fences, no commentary outside the JSON, matching exactly this shape:
{
  "slides": [
    { "order": 1, "layout": "title_exec_summary", "workingTitle": "...", "purpose": "...", "categories": [] },
    { "order": 2, "layout": "kpi_chart_interpretation", "workingTitle": "...", "purpose": "...", "categories": [{ "id": "wastage_breakdown" }] }
  ]
}`;
}

interface RawPlanSlide {
  order?: unknown;
  layout?: unknown;
  workingTitle?: unknown;
  purpose?: unknown;
  categories?: unknown;
}

function validateAndCoercePlan(
  raw: unknown,
  request: PresentationPlanRequest,
  availableIds: ReadonlySet<DataCategoryId>,
): { ok: true; plan: PresentationPlan } | { ok: false; message: string } {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { slides?: unknown }).slides)) {
    return { ok: false, message: 'Plan response was not in the expected shape.' };
  }
  const rawSlides = (raw as { slides: RawPlanSlide[] }).slides;
  if (rawSlides.length !== request.slideCount) {
    return { ok: false, message: `Plan returned ${rawSlides.length} slides but ${request.slideCount} were requested.` };
  }

  const validLayouts = new Set<SlideLayout>([
    'title_exec_summary',
    'kpi_chart_interpretation',
    'large_chart_finding',
    'two_chart_comparison',
    'table_insight',
    'recommendations',
    'scenario_optimization_comparison',
    'sources_methodology',
  ]);

  const slides: PlannedSlide[] = [];
  for (let i = 0; i < rawSlides.length; i++) {
    const rs = rawSlides[i];
    const layout = typeof rs.layout === 'string' && validLayouts.has(rs.layout as SlideLayout) ? (rs.layout as SlideLayout) : null;
    if (!layout) return { ok: false, message: `Slide ${i + 1} has an unknown or missing layout.` };

    const purpose = typeof rs.purpose === 'string' && rs.purpose.trim() ? rs.purpose.trim() : 'Presents relevant verified data for this section.';
    const workingTitle = sanitizeWorkingTitle(typeof rs.workingTitle === 'string' ? rs.workingTitle : '', purpose);

    // Strip any category not on the allowed list rather than trusting it —
    // this is the actual access-control enforcement point, not just the
    // prompt text above (never trust the model to have honored the prompt).
    const rawCategories = Array.isArray(rs.categories) ? rs.categories : [];
    const categories = rawCategories
      .filter((c): c is { id: DataCategoryId; params?: Record<string, unknown> } => typeof c === 'object' && c !== null && typeof (c as { id?: unknown }).id === 'string')
      .filter((c) => availableIds.has(c.id))
      .map((c) => ({ id: c.id, params: typeof c.params === 'object' && c.params !== null ? (c.params as Record<string, unknown>) : undefined }));

    if (LAYOUTS_REQUIRING_NO_CATEGORY.has(layout) && categories.length > 0) {
      // Not an error — a non-data layout simply never renders a category. Drop silently.
      categories.length = 0;
    } else if (LAYOUTS_ALLOWING_TWO_CATEGORIES.has(layout)) {
      if (categories.length === 0) return { ok: false, message: `Slide ${i + 1} (${layout}) needs at least one valid data category.` };
      if (categories.length > 2) categories.length = 2;
    } else if (!LAYOUTS_REQUIRING_NO_CATEGORY.has(layout)) {
      if (categories.length === 0) return { ok: false, message: `Slide ${i + 1} (${layout}) needs exactly one valid data category.` };
      if (categories.length > 1) categories.length = 1;
    }

    slides.push({ order: i + 1, layout, workingTitle, purpose, categories });
  }

  if (slides[0]?.layout !== 'title_exec_summary') return { ok: false, message: 'First slide must be the title/executive-summary slide.' };
  if (slides[slides.length - 1]?.layout !== 'sources_methodology') return { ok: false, message: 'Last slide must be the sources/methodology slide.' };

  return {
    ok: true,
    plan: { objective: request.objective, audience: request.audience?.trim() || null, style: request.style, slides },
  };
}

export async function planPresentation(request: PresentationPlanRequest): Promise<PlanOutcome> {
  if (request.slideCount < MIN_SLIDES || request.slideCount > MAX_SLIDES) {
    return { ok: false, reason: 'invalid_request', message: `Slide count must be between ${MIN_SLIDES} and ${MAX_SLIDES}.` };
  }
  if (!request.objective.trim()) {
    return { ok: false, reason: 'invalid_request', message: 'An objective is required.' };
  }
  if (request.availableCategoryIds.length === 0) {
    return { ok: false, reason: 'no_categories', message: 'No verified data categories are available for this request.' };
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: "The AI Presentation Builder isn't configured yet. Add an Anthropic API key in Settings." };
  }

  const availableIds = new Set(request.availableCategoryIds);
  const availableCategories = request.availableCategoryIds.map((id) => DATA_CATEGORY_CATALOG[id]);

  const userMessage = `Objective: ${request.objective.trim()}
Slide count: ${request.slideCount}
Style: ${request.style}
Audience: ${request.audience?.trim() || 'not specified — assume general management'}

Plan the presentation now.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      system: buildSystemPrompt(availableCategories),
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: 'error', message: "The presentation plan couldn't be parsed. Please try again." };
    }

    const validated = validateAndCoercePlan(parsed, request, availableIds);
    if (!validated.ok) return { ok: false, reason: 'error', message: validated.message };
    return { ok: true, plan: validated.plan };
  } catch (err) {
    // Same empirically-verified-clean Anthropic error shape as
    // anthropicInterpreter.ts — see that file's comment for why this is safe
    // to return as-is (and why that doesn't generalize to other providers).
    return { ok: false, reason: 'error', message: `Could not build the presentation plan: ${err instanceof Error ? err.message : String(err)}` };
  }
}
