import { Router } from 'express';
import multer from 'multer';
import { requireRole } from '../rbac.ts';
import { buildExcelExport, confirmUpload, getUpload, listUploads, processUpload } from '../services/dataProcessor.ts';
import { isAnthropicConfigured } from '../services/anthropicInterpreter.ts';
import { isEmailConfigured, sendReportEmail } from '../services/email.ts';

export const dataProcessorRouter = Router();

// Uploaded files are never written to disk — extracted in memory and
// discarded once interpreted, matching the source's own disclosure ("not
// stored by this dashboard beyond the current session"). A generous but
// bounded size cap avoids an unbounded-memory upload.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 5 } });

dataProcessorRouter.get('/data-processor/status', (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  res.json({ anthropicConfigured: isAnthropicConfigured(), emailConfigured: isEmailConfigured() });
});

dataProcessorRouter.get('/data-processor/uploads', (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  res.json(listUploads());
});

dataProcessorRouter.post('/data-processor/upload', upload.array('files', 5), async (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) return res.status(400).json({ error: 'at least one file is required' });

  const outcome = await processUpload(
    files.map((f) => ({ filename: f.originalname, buffer: f.buffer })),
    session.employeeId,
  );

  if (!outcome.ok) {
    const status = outcome.reason === 'not_configured' ? 409 : 502;
    return res.status(status).json({ error: outcome.message, reason: outcome.reason });
  }
  res.status(201).json(outcome.upload);
});

dataProcessorRouter.post('/data-processor/:id/confirm', (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  const id = Number(req.params.id);
  const updated = confirmUpload(id);
  if (!updated) return res.status(404).json({ error: 'upload not found' });
  res.json(updated);
});

dataProcessorRouter.get('/data-processor/:id/export', async (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  const id = Number(req.params.id);
  const upload = getUpload(id);
  if (!upload) return res.status(404).json({ error: 'upload not found' });
  if (upload.status !== 'confirmed') return res.status(409).json({ error: 'confirm this interpretation before exporting it' });

  const buffer = await buildExcelExport(upload);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="data-processor-${id}.xlsx"`);
  res.send(buffer);
});

dataProcessorRouter.post('/data-processor/:id/email', async (req, res) => {
  const session = requireRole(req, res, ['manager', 'hr_admin']);
  if (!session) return;
  const id = Number(req.params.id);
  const upload = getUpload(id);
  if (!upload) return res.status(404).json({ error: 'upload not found' });
  if (upload.status !== 'confirmed') return res.status(409).json({ error: 'confirm this interpretation before emailing it' });

  const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
  if (to === '') return res.status(400).json({ error: 'recipient email is required' });

  const buffer = await buildExcelExport(upload);
  const outcome = await sendReportEmail({
    to,
    subject: `Grandiose Bakery — Data Processor report (${upload.filename})`,
    bodyText: `Attached: the confirmed interpretation of ${upload.filename}.\n\n${upload.summary ?? ''}`,
    attachment: { filename: `data-processor-${id}.xlsx`, content: buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  });

  if (!outcome.ok) {
    const status = outcome.reason === 'not_configured' ? 409 : 502;
    return res.status(status).json({ error: outcome.message });
  }
  res.status(204).end();
});
