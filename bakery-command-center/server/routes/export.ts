import { Router } from 'express';
import { requireAuth } from '../rbac.ts';
import { buildCsv, buildDocx, buildPdf, buildXlsx, type DocSpec, type TableSheet } from '../services/export.ts';

export const exportRouter = Router();

// Not privileged data — every export only reformats content the caller can
// already see on whatever page they're viewing, so any authenticated session
// is enough (no role gate), matching what the export itself exposes.

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '_').trim().slice(0, 80) || 'export';
}

function isDocSpec(body: unknown): body is DocSpec {
  const b = body as Partial<DocSpec> | null;
  return !!b && typeof b.title === 'string' && b.title.trim() !== '' && Array.isArray(b.sections);
}

function isTableSheet(sheet: unknown): sheet is TableSheet {
  const s = sheet as Partial<TableSheet> | null;
  return !!s && typeof s.name === 'string' && Array.isArray(s.columns) && Array.isArray(s.rows);
}

exportRouter.post('/export/docx', async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!isDocSpec(req.body)) return res.status(400).json({ error: 'title (non-empty string) and sections (array) are required' });

  const buffer = await buildDocx(req.body);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(req.body.title)}.docx"`);
  res.send(buffer);
});

exportRouter.post('/export/pdf', async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!isDocSpec(req.body)) return res.status(400).json({ error: 'title (non-empty string) and sections (array) are required' });

  const buffer = await buildPdf(req.body);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(req.body.title)}.pdf"`);
  res.send(buffer);
});

exportRouter.post('/export/csv', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  if (!isTableSheet(req.body)) return res.status(400).json({ error: 'name, columns (array), and rows (array) are required' });

  const csv = buildCsv(req.body);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(req.body.name)}.csv"`);
  res.send(csv);
});

exportRouter.post('/export/xlsx', async (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const sheets: unknown = req.body?.sheets;
  if (!Array.isArray(sheets) || sheets.length === 0 || !sheets.every(isTableSheet)) {
    return res.status(400).json({ error: 'sheets must be a non-empty array of {name, columns, rows}' });
  }

  const buffer = await buildXlsx(sheets);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(sheets[0].name)}.xlsx"`);
  res.send(buffer);
});
