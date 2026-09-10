import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, requireRole, scopeEmployeeIds, canViewEmployee, canActOnEmployee } from '../rbac.ts';
import { getFeedback, saveFeedback, acknowledgeFeedback } from '../services/feedback.ts';

export const feedbackRouter = Router();

feedbackRouter.get('/feedback', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const requestedEmployeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;

  if (requestedEmployeeId) {
    if (!canViewEmployee(session, requestedEmployeeId)) return res.status(403).json({ error: 'not authorised' });
    return res.json(getFeedback([requestedEmployeeId]));
  }
  res.json(getFeedback(scopeEmployeeIds(session)));
});

feedbackRouter.post('/feedback', (req, res) => {
  const session = requireRole(req, res, ['supervisor', 'manager', 'hr_admin']);
  if (!session) return;

  const body = req.body ?? {};
  const employeeId = String(body.employeeId ?? '');
  const category = String(body.category ?? '').trim();
  const comment = String(body.comment ?? '').trim();
  if (!employeeId || !category || !comment) return res.status(400).json({ error: 'employeeId, category, and comment are required' });
  if (!canActOnEmployee(session, employeeId)) return res.status(403).json({ error: 'not authorised to give feedback to this employee' });

  const feedback = saveFeedback(
    { employeeId, category, assessment: body.assessment ?? null, comment, followUpDate: body.followUpDate ?? null },
    session.employeeId,
    session.role,
  );
  res.status(201).json(feedback);
});

feedbackRouter.post('/feedback/:id/acknowledge', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const id = Number(req.params.id);
  const existing = db.prepare('SELECT employee_id FROM feedback WHERE id = ?').get(id) as { employee_id: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'feedback not found' });

  // Only the employee the feedback is about may acknowledge it — not their manager, not HR.
  if (session.employeeId !== existing.employee_id) {
    return res.status(403).json({ error: 'only the employee this feedback is about may acknowledge it' });
  }

  const employeeResponse = typeof req.body?.response === 'string' ? req.body.response : null;
  const feedback = acknowledgeFeedback(id, employeeResponse, session.employeeId, session.role);
  res.json(feedback);
});
