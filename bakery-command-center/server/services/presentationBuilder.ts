// AI Presentation Builder — Step 7's service half: wires Steps 2-6 into one
// call (plan → narrate → build .pptx) and records the lightweight history
// row. The route (presentationBuilder.ts under routes/) owns HTTP concerns
// (role gate, request parsing, response headers) — this file owns the
// pipeline itself, so it can also be reused by a future non-HTTP caller
// (e.g. a Grandiose Copilot "create a presentation from this" action,
// explicitly noted in the spec as optional/non-blocking for V1) without
// duplicating the orchestration.
import { db } from '../db.ts';
import type { EmployeeSession } from '../auth.ts';
import { planPresentation, MIN_SLIDES, MAX_SLIDES, type PresentationStyle, type DataCategoryId, DATA_CATEGORY_CATALOG } from './presentationPlanner.ts';
import { buildPresentationNarrative } from './presentationNarrative.ts';
import { buildPresentationPptx } from './pptxBuilder.ts';
import type { AttentionQuery } from './copilotTools.ts';

// V1 serves the dashboard-data path only (spec's data source B) — the
// uploaded-data aggregation path (source A) is Step 9's job and will add its
// own, narrower category list once a confirmed upload is turned into
// verified metrics; it must never simply reuse this list, since an uploaded
// file's data almost never covers all 13 categories.
const ALL_DASHBOARD_CATEGORY_IDS = Object.keys(DATA_CATEGORY_CATALOG) as DataCategoryId[];

export interface GeneratePresentationRequest {
  objective: string;
  slideCount: number;
  style: PresentationStyle;
  audience?: string;
  commandCenterQuery?: AttentionQuery;
}

export type GeneratePresentationOutcome =
  | { ok: true; buffer: Buffer; warnings: string[]; slideCount: number; historyId: number }
  | { ok: false; status: number; error: string };

export async function generatePresentation(request: GeneratePresentationRequest, session: EmployeeSession): Promise<GeneratePresentationOutcome> {
  if (typeof request.slideCount !== 'number' || request.slideCount < MIN_SLIDES || request.slideCount > MAX_SLIDES) {
    return { ok: false, status: 400, error: `Slide count must be between ${MIN_SLIDES} and ${MAX_SLIDES}.` };
  }
  if (typeof request.objective !== 'string' || !request.objective.trim()) {
    return { ok: false, status: 400, error: 'An objective is required.' };
  }

  const planOutcome = await planPresentation({
    objective: request.objective,
    slideCount: request.slideCount,
    style: request.style,
    audience: request.audience,
    availableCategoryIds: ALL_DASHBOARD_CATEGORY_IDS,
  });
  if (!planOutcome.ok) {
    const status = planOutcome.reason === 'not_configured' ? 409 : planOutcome.reason === 'invalid_request' || planOutcome.reason === 'no_categories' ? 400 : 502;
    return { ok: false, status, error: planOutcome.message };
  }

  const narrative = await buildPresentationNarrative({ plan: planOutcome.plan, session, commandCenterQuery: request.commandCenterQuery });
  const { buffer, warnings } = await buildPresentationPptx({ plan: planOutcome.plan, narrative });

  const modulesUsed = [...new Set(planOutcome.plan.slides.flatMap((s) => s.categories.map((c) => DATA_CATEGORY_CATALOG[c.id].label)))];
  const resultMeta = {
    slides: narrative.slides.map((s) => ({ order: s.order, layout: s.layout, title: s.title })),
    warnings,
    generatedAt: narrative.generatedAt,
    anyDemoData: narrative.slides.some((s) => s.isDemoData),
  };

  const now = new Date().toISOString();
  const insertResult = db
    .prepare(
      `INSERT INTO presentation_history (objective, slide_count, audience, style, data_source, data_processor_upload_id, modules_used_json, result_meta_json, created_by_employee_id, created_at)
       VALUES (?, ?, ?, ?, 'dashboard', NULL, ?, ?, ?, ?)`,
    )
    .run(planOutcome.plan.objective, narrative.slides.length, planOutcome.plan.audience, planOutcome.plan.style, JSON.stringify(modulesUsed), JSON.stringify(resultMeta), session.employeeId, now);

  return { ok: true, buffer, warnings, slideCount: narrative.slides.length, historyId: Number(insertResult.lastInsertRowid) };
}

export interface PresentationHistoryEntry {
  id: number;
  objective: string;
  slideCount: number;
  audience: string | null;
  style: string;
  dataSource: 'upload' | 'dashboard';
  modulesUsed: string[];
  slideTitles: { order: number; layout: string; title: string }[];
  warnings: string[];
  anyDemoData: boolean;
  createdByEmployeeId: string;
  createdAt: string;
}

interface PresentationHistoryRow {
  id: number;
  objective: string;
  slide_count: number;
  audience: string | null;
  style: string;
  data_source: 'upload' | 'dashboard';
  modules_used_json: string;
  result_meta_json: string;
  created_by_employee_id: string;
  created_at: string;
}

function toHistoryEntry(row: PresentationHistoryRow): PresentationHistoryEntry {
  const meta = JSON.parse(row.result_meta_json) as { slides: { order: number; layout: string; title: string }[]; warnings: string[]; anyDemoData: boolean };
  return {
    id: row.id,
    objective: row.objective,
    slideCount: row.slide_count,
    audience: row.audience,
    style: row.style,
    dataSource: row.data_source,
    modulesUsed: JSON.parse(row.modules_used_json) as string[],
    slideTitles: meta.slides,
    warnings: meta.warnings,
    anyDemoData: meta.anyDemoData,
    createdByEmployeeId: row.created_by_employee_id,
    createdAt: row.created_at,
  };
}

/** Simple, company-wide list (no per-employee scoping) — matches this whole feature's access model: only manager/hr_admin ever reach it (same gate as Data Processor), and a presentation's own content already went through per-category role checks at generation time. Newest first, capped at 50 — a history table, not an archive; nothing here is large enough to need pagination yet. */
export function listPresentationHistory(): PresentationHistoryEntry[] {
  const rows = db.prepare('SELECT * FROM presentation_history ORDER BY created_at DESC LIMIT 50').all() as unknown as PresentationHistoryRow[];
  return rows.map(toHistoryEntry);
}
