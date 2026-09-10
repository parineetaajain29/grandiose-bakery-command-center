import { Router } from 'express';
import { requireAuth, requireRole, scopeEmployeeIds, canViewEmployee, canActOnEmployee } from '../rbac.ts';
import { getGoals, getGoalById, saveGoal, updateGoalStatus, type GoalStatus } from '../services/goals.ts';

export const goalsRouter = Router();

goalsRouter.get('/goals', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const requestedEmployeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;

  if (requestedEmployeeId) {
    if (!canViewEmployee(session, requestedEmployeeId)) return res.status(403).json({ error: 'not authorised' });
    return res.json(getGoals([requestedEmployeeId]));
  }
  res.json(getGoals(scopeEmployeeIds(session)));
});

goalsRouter.post('/goals', (req, res) => {
  const session = requireRole(req, res, ['supervisor', 'manager', 'hr_admin']);
  if (!session) return;

  const body = req.body ?? {};
  const employeeId = String(body.employeeId ?? '');
  const title = String(body.title ?? '').trim();
  if (!employeeId || !title) return res.status(400).json({ error: 'employeeId and title are required' });
  if (!canActOnEmployee(session, employeeId)) return res.status(403).json({ error: 'not authorised to set goals for this employee' });

  const goal = saveGoal(
    {
      employeeId,
      title,
      metric: body.metric ?? null,
      baseline: body.baseline == null ? null : Number(body.baseline),
      target: body.target == null ? null : Number(body.target),
      deadline: body.deadline ?? null,
      notes: body.notes ?? null,
    },
    session.employeeId,
    session.role,
  );
  res.status(201).json(goal);
});

const VALID_STATUSES: GoalStatus[] = ['active', 'completed', 'overdue', 'cancelled'];

goalsRouter.put('/goals/:id/status', (req, res) => {
  const session = requireRole(req, res, ['supervisor', 'manager', 'hr_admin']);
  if (!session) return;

  const status = req.body?.status as GoalStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const id = Number(req.params.id);
  const existing = getGoalById(id);
  if (!existing) return res.status(404).json({ error: 'goal not found' });
  if (!canActOnEmployee(session, existing.employeeId)) return res.status(403).json({ error: 'not authorised' });

  const goal = updateGoalStatus(id, status, session.employeeId, session.role);
  res.json(goal);
});
