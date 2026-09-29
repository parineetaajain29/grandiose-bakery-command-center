// AI Presentation Builder — Step 9: the uploaded-data source (spec's data
// source A, the companion to presentationData.ts's dashboard source B).
//
// A confirmed Data Processor upload (server/services/dataProcessor.ts) is
// already AI-interpreted into `{ sheet_name, title, columns, rows, insights }`
// — free-form tabular data with AI-guessed column meaning, human-confirmed
// once at upload time. That confirm step is real (a person looked at the
// table and clicked "Confirm this interpretation"), but it is NOT the same
// guarantee as a dashboard figure computed by this app's own formulas — so
// this file never re-runs Claude over it and never invents a fixed schema
// for it. Instead it does one deterministic (Claude-free, pure-code) pass:
// for every column in every sheet, decide numeric vs. categorical from the
// cell values themselves, and compute the same kind of honest, boring
// aggregate a spreadsheet's own SUM/AVERAGE/COUNTA would — nothing beyond
// that. Anything the aggregation can't confidently characterize (an empty
// column, a column too mixed to call either way) is surfaced in `gaps`
// rather than silently guessed at or dropped without a trace, per the
// spec's "surface, don't estimate" rule for uploaded data.
//
// Each sheet becomes exactly one presentation data category, id
// `upload:<sheetIndex>` — never the fixed 13-category dashboard catalog,
// because an uploaded file's columns are not that catalog's shape. The
// category is wired into the same ToolResult<T> envelope
// (ok()/err() from copilotTools.ts) every dashboard category already uses,
// so presentationNarrative.ts's token-substitution safeguard applies to
// upload data exactly as strictly as it applies to dashboard data — an
// uploaded number can only ever reach a slide as a {{token}}, same as
// everywhere else in this pipeline.
import { ok, err, type ToolResult } from './copilotTools.ts';
import type { UploadRow } from './dataProcessor.ts';
import type { DataCategoryInfo } from './presentationPlanner.ts';

export type UploadCategoryId = `upload:${number}`;

export interface UploadNumericColumn {
  column: string;
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
}

export interface UploadCategoricalColumn {
  column: string;
  distinctCount: number;
  topValues: { value: string; count: number }[];
}

export interface UploadSheetMetrics {
  sheetTitle: string;
  rowCount: number;
  numericColumns: UploadNumericColumn[];
  categoricalColumns: UploadCategoricalColumn[];
  /** Never true for uploaded data — this is the user's own real file, not a fallback scenario. Kept so this shape matches every other category's data (presentationNarrative.ts checks this field generically) without special-casing uploads. */
  isDemoData: false;
}

export interface UploadCategory {
  id: UploadCategoryId;
  info: DataCategoryInfo;
  result: ToolResult<UploadSheetMetrics>;
}

export interface UploadAggregationOutcome {
  categories: UploadCategory[];
  /** Columns/sheets the aggregation could not confidently characterize — shown to the person, never silently estimated. */
  gaps: string[];
}

const ROW_SAMPLE_CAP = 500; // upload sheets are already summarized by the interpreter, but this bounds pathological cases rather than trusting that
const NUMERIC_COLUMN_THRESHOLD = 0.6; // a column needs a clear numeric majority among its non-empty cells to be treated as numeric, not just any parseable value
const MIN_NUMERIC_SAMPLES = 2; // one lone parseable cell isn't enough signal to call a whole column numeric
const TOP_VALUES_LIMIT = 3;
const VALUE_LABEL_MAX_CHARS = 40;

function parseNumericCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '—' || trimmed.toLowerCase() === 'n/a') return null;
  const cleaned = trimmed.replace(/,/g, '').replace(/AED/gi, '').replace(/%$/, '').replace(/^\$/, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function truncateLabel(value: string): string {
  return value.length > VALUE_LABEL_MAX_CHARS ? `${value.slice(0, VALUE_LABEL_MAX_CHARS - 1)}…` : value;
}

/** One sheet's columns, classified and aggregated — pure function, no I/O, no AI. */
function aggregateSheet(columns: string[], rows: string[][], gaps: string[], sheetLabel: string): { numericColumns: UploadNumericColumn[]; categoricalColumns: UploadCategoricalColumn[] } {
  const sampledRows = rows.slice(0, ROW_SAMPLE_CAP);
  if (rows.length > ROW_SAMPLE_CAP) {
    gaps.push(`"${sheetLabel}": only the first ${ROW_SAMPLE_CAP} of ${rows.length} rows were aggregated.`);
  }

  const numericColumns: UploadNumericColumn[] = [];
  const categoricalColumns: UploadCategoricalColumn[] = [];

  columns.forEach((columnName, colIndex) => {
    const rawValues = sampledRows.map((r) => (r[colIndex] ?? '').toString().trim()).filter((v) => v !== '');
    if (rawValues.length === 0) {
      gaps.push(`"${sheetLabel}" → column "${columnName}" is empty and was skipped.`);
      return;
    }

    const numericValues = rawValues.map(parseNumericCell).filter((v): v is number => v !== null);
    const isNumeric = numericValues.length >= MIN_NUMERIC_SAMPLES && numericValues.length / rawValues.length >= NUMERIC_COLUMN_THRESHOLD;

    if (isNumeric) {
      if (numericValues.length < rawValues.length) {
        gaps.push(`"${sheetLabel}" → column "${columnName}": ${rawValues.length - numericValues.length} of ${rawValues.length} values weren't numeric and were excluded from this average.`);
      }
      const sum = numericValues.reduce((a, b) => a + b, 0);
      numericColumns.push({
        column: columnName,
        count: numericValues.length,
        sum,
        average: sum / numericValues.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
      });
      return;
    }

    const counts = new Map<string, number>();
    for (const v of rawValues) counts.set(v, (counts.get(v) ?? 0) + 1);
    const topValues = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_VALUES_LIMIT)
      .map(([value, count]) => ({ value: truncateLabel(value), count }));
    categoricalColumns.push({ column: columnName, distinctCount: counts.size, topValues });
  });

  return { numericColumns, categoricalColumns };
}

/**
 * The Step 9 entry point: turn a confirmed upload into presentation-ready
 * categories. Callers (presentationBuilder.ts) must verify
 * `upload.status === 'confirmed'` before calling this — mirroring the same
 * gate confirmDataProcessorUpload() already enforces for export/email, so an
 * un-reviewed AI interpretation can never reach a presentation either.
 */
export function aggregateUploadForPresentation(upload: UploadRow): UploadAggregationOutcome {
  const gaps: string[] = [];
  const sheets = upload.result?.sheets ?? [];
  if (sheets.length === 0) {
    gaps.push(`"${upload.filename}" has no interpreted sheets to build a presentation from.`);
    return { categories: [], gaps };
  }

  const source = `Uploaded file: ${upload.filename} (confirmed ${upload.confirmedAt ?? upload.uploadedAt})`;
  const categories: UploadCategory[] = [];

  sheets.forEach((sheet, sheetIndex) => {
    const sheetLabel = sheet.title || sheet.sheet_name;
    if (sheet.rows.length === 0) {
      gaps.push(`"${sheetLabel}" has no data rows and was skipped.`);
      return;
    }

    const { numericColumns, categoricalColumns } = aggregateSheet(sheet.columns, sheet.rows, gaps, sheetLabel);
    if (numericColumns.length === 0 && categoricalColumns.length === 0) {
      gaps.push(`"${sheetLabel}" had no usable columns and was skipped.`);
      return;
    }

    const id: UploadCategoryId = `upload:${sheetIndex}`;
    const metrics: UploadSheetMetrics = {
      sheetTitle: sheetLabel,
      rowCount: sheet.rows.length,
      numericColumns,
      categoricalColumns,
      isDemoData: false,
    };

    categories.push({
      id,
      info: {
        id,
        label: sheetLabel,
        description: `From the uploaded file "${upload.filename}", sheet "${sheetLabel}" — ${sheet.columns.length} column(s), ${sheet.rows.length} row(s). AI-interpreted and confirmed by a manager; accuracy depends on the source file.`,
      },
      result: numericColumns.length > 0 || categoricalColumns.length > 0 ? ok(metrics, source) : err('no_data', `No usable data found in "${sheetLabel}".`),
    });
  });

  if (categories.length === 0) {
    gaps.push(`"${upload.filename}" produced no usable presentation data.`);
  }

  return { categories, gaps };
}
