import { Router } from 'express';
import { requireRole } from '../rbac.ts';
import {
  clearAnthropicApiKey,
  clearEmailCredentials,
  getSettingsStatus,
  setAnthropicApiKey,
  setEmailCredentials,
} from '../services/settings.ts';

export const settingsRouter = Router();

const MANAGEMENT_ROLES = ['manager', 'hr_admin'] as const;

settingsRouter.get('/settings/status', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  res.json(getSettingsStatus());
});

settingsRouter.post('/settings/anthropic-key', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  if (apiKey === '') return res.status(400).json({ error: 'apiKey is required' });
  setAnthropicApiKey(apiKey);
  res.status(204).end();
});

settingsRouter.delete('/settings/anthropic-key', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  clearAnthropicApiKey();
  res.status(204).end();
});

settingsRouter.post('/settings/email', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  const emailAddress = typeof req.body?.emailAddress === 'string' ? req.body.emailAddress.trim() : '';
  const appPassword = typeof req.body?.appPassword === 'string' ? req.body.appPassword.trim() : '';
  if (emailAddress === '' || appPassword === '') {
    return res.status(400).json({ error: 'emailAddress and appPassword are required' });
  }
  const smtpServer = typeof req.body?.smtpServer === 'string' && req.body.smtpServer.trim() !== '' ? req.body.smtpServer.trim() : undefined;
  const smtpPort = typeof req.body?.smtpPort === 'number' ? req.body.smtpPort : undefined;
  setEmailCredentials({ emailAddress, appPassword, smtpServer, smtpPort });
  res.status(204).end();
});

settingsRouter.delete('/settings/email', (req, res) => {
  const session = requireRole(req, res, [...MANAGEMENT_ROLES]);
  if (!session) return;
  clearEmailCredentials();
  res.status(204).end();
});
