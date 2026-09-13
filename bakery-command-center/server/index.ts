import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.ts';
import { employeesRouter } from './routes/employees.ts';
import { dailyLogsRouter } from './routes/dailyLogs.ts';
import { metricsRouter } from './routes/metrics.ts';
import { goalsRouter } from './routes/goals.ts';
import { feedbackRouter } from './routes/feedback.ts';
import { auditRouter } from './routes/audit.ts';
import { adminRouter } from './routes/admin.ts';
import { alertsRouter } from './routes/alerts.ts';
import { settingsRouter } from './routes/settings.ts';
import { dataProcessorRouter } from './routes/dataProcessor.ts';
import { aiRiskRouter } from './routes/aiRisk.ts';
import { resolveSession, parseCookies, SESSION_COOKIE } from './auth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

app.use((req, _res, next) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  req.employeeSession = resolveSession(token) ?? undefined;
  next();
});

app.use('/api/auth', authRouter);
app.use('/api', employeesRouter);
app.use('/api', dailyLogsRouter);
app.use('/api', metricsRouter);
app.use('/api', goalsRouter);
app.use('/api', feedbackRouter);
app.use('/api', auditRouter);
app.use('/api', adminRouter);
app.use('/api', alertsRouter);
app.use('/api', settingsRouter);
app.use('/api', dataProcessorRouter);
app.use('/api', aiRiskRouter);

if (isProduction) {
  // Single-process shape for running unmodified on Grandiose's desktop:
  // `npm run build` once, then this same server serves the built frontend
  // and the API from one port.
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Backstop for every route: an uncaught exception anywhere in a handler
// should never reach the client as a raw 500/stack trace. Individual routes
// (e.g. login) still catch and translate their own expected failure cases —
// this only catches what they don't.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error in request handler:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'something went wrong' });
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}${isProduction ? ' (serving built frontend too)' : ''}`);
});
