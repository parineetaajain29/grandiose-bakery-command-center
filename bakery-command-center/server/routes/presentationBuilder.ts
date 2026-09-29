// AI Presentation Builder — Step 7's HTTP half. Same role gate as Data
// Processor (manager/hr_admin) since this feature lives inside that page —
// see DataProcessorPage.tsx's future "Process Data | Build Presentation"
// tab split (Step 8). Generation is synchronous and returns the .pptx
// buffer directly in the response, matching the architecture decision made
// when this feature was scoped: no job queue, no polling — a single request
// that runs plan → narrate → build and streams the file back, with branded
// non-fake progress states owned entirely by the frontend (Step 8) rather
// than a real multi-request progress protocol.
import { Router } from 'express';
import { requireRole } from '../rbac.ts';
import { generatePresentation, listPresentationHistory, type GeneratePresentationRequest } from '../services/presentationBuilder.ts';
import { isAnthropicConfigured } from '../services/presentationPlanner.ts';
import type { PresentationStyle } from '../services/presentationPlanner.ts';

const MANAGEMENT_ROLES = ['manager', 'hr_admin'] as const;
const VALID_STYLES: PresentationStyle[] = ['executive_summary', 'management_analysis', 'detailed_review'];

export const presentationBuilderRouter = Router();

presentationBuilderRouter.get('/presentation-builder/status', (req, res) => {
  const session = requireRole(req, res, MANAGEMENT_ROLES);
  if (!session) return;
  res.json({ anthropicConfigured: isAnthropicConfigured() });
});

presentationBuilderRouter.get('/presentation-builder/history', (req, res) => {
  const session = requireRole(req, res, MANAGEMENT_ROLES);
  if (!session) return;
  res.json(listPresentationHistory());
});

presentationBuilderRouter.post('/presentation-builder/generate', async (req, res) => {
  const session = requireRole(req, res, MANAGEMENT_ROLES);
  if (!session) return;

  const body = req.body ?? {};
  if (typeof body.style === 'string' && !VALID_STYLES.includes(body.style)) {
    return res.status(400).json({ error: `style must be one of: ${VALID_STYLES.join(', ')}` });
  }

  if (body.dataSource !== undefined && body.dataSource !== 'dashboard' && body.dataSource !== 'upload') {
    return res.status(400).json({ error: 'dataSource must be "dashboard" or "upload".' });
  }

  const request: GeneratePresentationRequest = {
    objective: typeof body.objective === 'string' ? body.objective : '',
    slideCount: typeof body.slideCount === 'number' ? body.slideCount : NaN,
    style: (body.style as PresentationStyle | undefined) ?? 'management_analysis',
    audience: typeof body.audience === 'string' ? body.audience : undefined,
    commandCenterQuery: typeof body.commandCenterQuery === 'object' && body.commandCenterQuery !== null ? body.commandCenterQuery : undefined,
    dataSource: body.dataSource as 'dashboard' | 'upload' | undefined,
    uploadId: typeof body.uploadId === 'number' ? body.uploadId : undefined,
  };

  const outcome = await generatePresentation(request, session);
  if (!outcome.ok) {
    return res.status(outcome.status).json({ error: outcome.error });
  }

  const safeObjective = outcome.slideCount > 0 ? request.objective.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60).replace(/^-+|-+$/g, '') : 'presentation';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${safeObjective || 'presentation'}.pptx"`);
  res.setHeader('X-Presentation-Warnings', String(outcome.warnings.length));
  res.setHeader('X-Presentation-History-Id', String(outcome.historyId));
  res.send(outcome.buffer);
});
