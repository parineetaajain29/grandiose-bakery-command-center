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
import { planPresentation, MIN_SLIDES, MAX_SLIDES, type PresentationStyle, type DataCategoryId, type DataCategoryInfo, DATA_CATEGORY_CATALOG } from './presentationPlanner.ts';
import { buildPresentationNarrative } from './presentationNarrative.ts';
import { buildPresentationPptx } from './pptxBuilder.ts';
import { pickRandomTheme } from './presentationTheme.ts';
import type { AttentionQuery, ToolResult } from './copilotTools.ts';
import { getUpload } from './dataProcessor.ts';
import { aggregateUploadForPresentation } from './presentationUploadData.ts';

// Data source B (spec) — the dashboard's own fixed 13-category catalog,
// always fully available to any session that passes this feature's
// manager/hr_admin gate (see this file's own route for why V1 doesn't
// further narrow it per-role: getEmployeesNeedingAttention still does its
// own internal scoping regardless).
const ALL_DASHBOARD_CATEGORY_IDS = Object.keys(DATA_CATEGORY_CATALOG) as DataCategoryId[];
const ALL_DASHBOARD_CATEGORIES: DataCategoryInfo[] = ALL_DASHBOARD_CATEGORY_IDS.map((id) => DATA_CATEGORY_CATALOG[id]);

export interface GeneratePresentationRequest {
  objective: string;
  slideCount: number;
  style: PresentationStyle;
  audience?: string;
  commandCenterQuery?: AttentionQuery;
  /** Data source B (default) is the live dashboard; source A (Step 9) is one confirmed Data Processor upload, identified by `uploadId`. */
  dataSource?: 'dashboard' | 'upload';
  uploadId?: number;
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

  const dataSource = request.dataSource ?? 'dashboard';

  // --- Resolve the available categories + (for uploads) their data up front,
  // before planning, so the planner only ever sees categories that actually
  // have data behind them — exactly parallel to how the dashboard path has
  // always worked, just with a per-request catalog instead of the fixed one.
  let availableCategories: DataCategoryInfo[];
  let categoryCatalog: Record<string, DataCategoryInfo>;
  let uploadDataMap: Map<string, ToolResult<unknown>> | undefined;
  let uploadWarnings: string[] = [];

  if (dataSource === 'upload') {
    if (typeof request.uploadId !== 'number') {
      return { ok: false, status: 400, error: 'uploadId is required when dataSource is "upload".' };
    }
    const upload = getUpload(request.uploadId);
    if (!upload) return { ok: false, status: 404, error: 'Upload not found.' };
    // Same confirm gate as export/email (server/routes/dataProcessor.ts) — an
    // un-reviewed AI interpretation can never reach a presentation either.
    if (upload.status !== 'confirmed') {
      return { ok: false, status: 409, error: 'Confirm this upload\'s interpretation before building a presentation from it.' };
    }

    const aggregation = aggregateUploadForPresentation(upload);
    if (aggregation.categories.length === 0) {
      return { ok: false, status: 400, error: `No usable data was found in "${upload.filename}" to build a presentation from.` };
    }

    availableCategories = aggregation.categories.map((c) => c.info);
    categoryCatalog = Object.fromEntries(aggregation.categories.map((c) => [c.id, c.info]));
    uploadDataMap = new Map(aggregation.categories.map((c) => [c.id, c.result]));
    uploadWarnings = aggregation.gaps;
  } else {
    availableCategories = ALL_DASHBOARD_CATEGORIES;
    categoryCatalog = DATA_CATEGORY_CATALOG;
  }

  const planOutcome = await planPresentation({
    objective: request.objective,
    slideCount: request.slideCount,
    style: request.style,
    audience: request.audience,
    availableCategories,
  });
  if (!planOutcome.ok) {
    const status = planOutcome.reason === 'not_configured' ? 409 : planOutcome.reason === 'invalid_request' || planOutcome.reason === 'no_categories' ? 400 : 502;
    return { ok: false, status, error: planOutcome.message };
  }

  const narrative = await buildPresentationNarrative({
    plan: planOutcome.plan,
    session,
    commandCenterQuery: request.commandCenterQuery,
    categoryCatalog,
    uploadData: uploadDataMap,
  });
  // One theme per generation (presentationTheme.ts) — every slide in this
  // deck renders with it, but the next deck generated (even for the same
  // objective) can land on a different one, per the user's "generate
  // different colours every time" request.
  const theme = pickRandomTheme();
  const { buffer, warnings: buildWarnings } = await buildPresentationPptx({ plan: planOutcome.plan, narrative, theme });
  const warnings = [...uploadWarnings, ...buildWarnings];

  const modulesUsed = [...new Set(planOutcome.plan.slides.flatMap((s) => s.categories.map((c) => categoryCatalog[c.id]?.label ?? c.id)))];
  const resultMeta = {
    slides: narrative.slides.map((s) => ({ order: s.order, layout: s.layout, title: s.title })),
    warnings,
    generatedAt: narrative.generatedAt,
    anyDemoData: narrative.slides.some((s) => s.isDemoData),
    themeName: theme.name,
  };

  const now = new Date().toISOString();
  const insertResult = db
    .prepare(
      `INSERT INTO presentation_history (objective, slide_count, audience, style, data_source, data_processor_upload_id, modules_used_json, result_meta_json, created_by_employee_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      planOutcome.plan.objective,
      narrative.slides.length,
      planOutcome.plan.audience,
      planOutcome.plan.style,
      dataSource,
      dataSource === 'upload' ? request.uploadId : null,
      JSON.stringify(modulesUsed),
      JSON.stringify(resultMeta),
      session.employeeId,
      now,
    );

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
  /** Undefined for history rows generated before theming shipped — result_meta_json won't have it. */
  themeName?: string;
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
  const meta = JSON.parse(row.result_meta_json) as { slides: { order: number; layout: string; title: string }[]; warnings: string[]; anyDemoData: boolean; themeName?: string };
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
    themeName: meta.themeName,
    createdByEmployeeId: row.created_by_employee_id,
    createdAt: row.created_at,
  };
}

/** Simple, company-wide list (no per-employee scoping) — matches this whole feature's access model: only manager/hr_admin ever reach it (same gate as Data Processor), and a presentation's own content already went through per-category role checks at generation time. Newest first, capped at 50 — a history table, not an archive; nothing here is large enough to need pagination yet. */
export function listPresentationHistory(): PresentationHistoryEntry[] {
  const rows = db.prepare('SELECT * FROM presentation_history ORDER BY created_at DESC LIMIT 50').all() as unknown as PresentationHistoryRow[];
  return rows.map(toHistoryEntry);
}
