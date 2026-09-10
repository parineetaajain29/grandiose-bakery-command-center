import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, scopeEmployeeIds, canViewEmployee, canActOnEmployee } from '../rbac.ts';
import { getDailyLogs, saveDailyLog, updateDailyLog, type SaveDailyLogInput } from '../services/dailyLogs.ts';
import type { DailyLogInput } from '../../src/lib/labourCalc.ts';

export const dailyLogsRouter = Router();

function parseRangeParams(req: import('express').Request): { from?: string; to?: string } {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  return { from, to };
}

dailyLogsRouter.get('/daily-logs', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const { from, to } = parseRangeParams(req);
  const requestedEmployeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;

  if (requestedEmployeeId) {
    if (!canViewEmployee(session, requestedEmployeeId)) {
      return res.status(403).json({ error: 'not authorised to view this employee' });
    }
    return res.json(getDailyLogs([requestedEmployeeId], from, to));
  }

  res.json(getDailyLogs(scopeEmployeeIds(session), from, to));
});

// Note: productiveMinutes is deliberately never read from the body here — it's derived
// server-side (server/services/dailyLogs.ts) from paid/break/changeover/downtime/idle,
// so a client-sent value (inflated or otherwise) is simply never looked at.
function readInput(body: Record<string, unknown>): DailyLogInput & {
  employeeId?: string;
  notes?: string | null;
  lossReason?: string | null;
  dailySalaryCost?: number | null;
  revenueAttributed?: number | null;
} {
  return {
    employeeId: typeof body.employeeId === 'string' ? body.employeeId : undefined,
    date: String(body.date ?? ''),
    shift: String(body.shift ?? ''),
    paidMinutes: Number(body.paidMinutes),
    breakMinutes: Number(body.breakMinutes),
    changeoverMinutes: Number(body.changeoverMinutes),
    downtimeMinutes: Number(body.downtimeMinutes),
    idleMinutes: Number(body.idleMinutes),
    activityType: String(body.activityType ?? ''),
    unitsProduced: body.unitsProduced == null ? null : Number(body.unitsProduced),
    downtimeCauseCode: typeof body.downtimeCauseCode === 'string' ? body.downtimeCauseCode : null,
    changeoverCauseCode: typeof body.changeoverCauseCode === 'string' ? body.changeoverCauseCode : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    lossReason: typeof body.lossReason === 'string' ? body.lossReason : null,
    dailySalaryCost: body.dailySalaryCost == null ? null : Number(body.dailySalaryCost),
    revenueAttributed: body.revenueAttributed == null ? null : Number(body.revenueAttributed),
  };
}

dailyLogsRouter.post('/daily-logs', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const input = readInput(req.body ?? {});
  const employeeId = input.employeeId ?? session.employeeId;

  if (!canActOnEmployee(session, employeeId)) {
    return res.status(403).json({ error: 'not authorised to log entries for this employee' });
  }

  const employeeExists = db.prepare('SELECT 1 FROM employees WHERE id = ?').get(employeeId);
  if (!employeeExists) return res.status(404).json({ error: `no employee with id ${employeeId}` });

  const saveInput: SaveDailyLogInput = { ...input, employeeId };
  const result = saveDailyLog(saveInput, session.employeeId, session.role);
  if (!result.ok) return res.status(400).json({ error: result.errors.join(' ') , errors: result.errors });
  res.status(201).json(result.log);
});

dailyLogsRouter.put('/daily-logs/:id', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const id = Number(req.params.id);
  const existing = db.prepare('SELECT employee_id FROM daily_logs WHERE id = ?').get(id) as { employee_id: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'log not found' });
  if (!canActOnEmployee(session, existing.employee_id)) {
    return res.status(403).json({ error: 'not authorised to edit this log' });
  }

  const input = readInput(req.body ?? {});
  const result = updateDailyLog(id, input, session.employeeId, session.role);
  if (!result.ok) return res.status(result.status).json({ error: result.errors.join(' '), errors: result.errors });
  res.json(result.log);
});
