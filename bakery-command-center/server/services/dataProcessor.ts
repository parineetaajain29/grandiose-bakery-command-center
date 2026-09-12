import ExcelJS from 'exceljs';
import { db } from '../db.ts';
import { extractFileText } from './fileExtraction.ts';
import { interpretUploadedFiles, type InterpretationResult } from './anthropicInterpreter.ts';

export interface UploadRow {
  id: number;
  filename: string;
  fileType: string;
  uploadedByEmployeeId: string;
  uploadedAt: string;
  status: 'interpreted' | 'confirmed';
  confirmedAt: string | null;
  detectedDataType: string | null;
  summary: string | null;
  result: InterpretationResult | null;
}

interface RawUploadRow {
  id: number;
  filename: string;
  file_type: string;
  uploaded_by_employee_id: string;
  uploaded_at: string;
  status: 'interpreted' | 'confirmed';
  confirmed_at: string | null;
  detected_data_type: string | null;
  summary: string | null;
  result_json: string | null;
}

function toUploadRow(r: RawUploadRow): UploadRow {
  return {
    id: r.id,
    filename: r.filename,
    fileType: r.file_type,
    uploadedByEmployeeId: r.uploaded_by_employee_id,
    uploadedAt: r.uploaded_at,
    status: r.status,
    confirmedAt: r.confirmed_at,
    detectedDataType: r.detected_data_type,
    summary: r.summary,
    result: r.result_json ? (JSON.parse(r.result_json) as InterpretationResult) : null,
  };
}

export type ProcessUploadOutcome =
  | { ok: true; upload: UploadRow }
  | { ok: false; reason: 'not_configured'; message: string }
  | { ok: false; reason: 'error'; message: string };

/**
 * Upload -> extract -> AI-interpret -> persist as an audit-trail row, one per
 * batch of files uploaded together. Mirrors app.py's data_processor page flow
 * (lines 3421-3506) with one deliberate addition: a human confirm step before
 * export/email, which the source doesn't have — see confirmUpload() below.
 */
export async function processUpload(
  files: { filename: string; buffer: Buffer }[],
  uploadedByEmployeeId: string,
): Promise<ProcessUploadOutcome> {
  const extracted = await Promise.all(files.map((f) => extractFileText(f.filename, f.buffer)));
  const outcome = await interpretUploadedFiles(extracted);

  if (!outcome.ok) {
    return outcome.reason === 'not_configured'
      ? { ok: false, reason: 'not_configured', message: outcome.message }
      : { ok: false, reason: 'error', message: outcome.message };
  }

  const now = new Date().toISOString();
  const fileType = files.length === 1 ? files[0].filename.split('.').pop() ?? 'unknown' : 'multiple';
  const filename = files.length === 1 ? files[0].filename : `${files.length} files`;

  const result = db
    .prepare(
      `INSERT INTO data_processor_uploads
        (filename, file_type, uploaded_by_employee_id, uploaded_at, status, detected_data_type, summary, result_json)
       VALUES (?, ?, ?, ?, 'interpreted', ?, ?, ?)`,
    )
    .run(filename, fileType, uploadedByEmployeeId, now, outcome.result.detected_data_type, outcome.result.summary, JSON.stringify(outcome.result));

  const row = db.prepare('SELECT * FROM data_processor_uploads WHERE id = ?').get(result.lastInsertRowid) as unknown as RawUploadRow;
  return { ok: true, upload: toUploadRow(row) };
}

export function getUpload(id: number): UploadRow | null {
  const row = db.prepare('SELECT * FROM data_processor_uploads WHERE id = ?').get(id) as unknown as RawUploadRow | undefined;
  return row ? toUploadRow(row) : null;
}

export function listUploads(): UploadRow[] {
  const rows = db.prepare('SELECT * FROM data_processor_uploads ORDER BY uploaded_at DESC').all() as unknown as RawUploadRow[];
  return rows.map(toUploadRow);
}

/** The explicit human-confirmation gate the brief asked for — nothing downstream (export/email) is available before this. */
export function confirmUpload(id: number): UploadRow | null {
  const existing = getUpload(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`UPDATE data_processor_uploads SET status = 'confirmed', confirmed_at = ? WHERE id = ?`).run(now, id);
  return getUpload(id);
}

/** One worksheet per interpreted sheet, mirroring the source's _build_smart_upload_sheets — only ever called on a confirmed upload (enforced by the route, not here). */
export async function buildExcelExport(upload: UploadRow): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRow(['Detected data type', upload.detectedDataType ?? '']);
  summarySheet.addRow(['Summary', upload.summary ?? '']);
  summarySheet.addRow(['Source file', upload.filename]);
  summarySheet.addRow(['Confirmed at', upload.confirmedAt ?? '']);

  for (const sheet of upload.result?.sheets ?? []) {
    const ws = workbook.addWorksheet(sheet.sheet_name.slice(0, 31) || 'Sheet');
    ws.addRow(sheet.columns);
    for (const row of sheet.rows) ws.addRow(row);
    if (sheet.insights.length > 0) {
      ws.addRow([]);
      ws.addRow(['Insights']);
      for (const insight of sheet.insights) ws.addRow([insight]);
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
