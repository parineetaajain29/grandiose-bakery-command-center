// Write-only credential storage (Data Processor / Phase 7). Nothing in this
// file ever returns a stored value to a caller outside the server process —
// getSettingsStatus() only reports whether a value exists, never what it is.
// Values live in app_settings inside bakery.db (server/db.ts) — the same file
// as every employee record, not a separate one.
import { db } from '../db.ts';

const ANTHROPIC_KEY = 'anthropic_api_key';
const EMAIL_ADDRESS_KEY = 'email_address';
const EMAIL_APP_PASSWORD_KEY = 'email_app_password';
const SMTP_SERVER_KEY = 'smtp_server';
const SMTP_PORT_KEY = 'smtp_port';

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

function clearSetting(key: string): void {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

export function setAnthropicApiKey(apiKey: string): void {
  setSetting(ANTHROPIC_KEY, apiKey);
}

export function clearAnthropicApiKey(): void {
  clearSetting(ANTHROPIC_KEY);
}

/** Only ever called server-side (the Anthropic client, never a route handler that echoes it back). */
export function getAnthropicApiKey(): string | null {
  return getSetting(ANTHROPIC_KEY);
}

export interface EmailCredentialsInput {
  emailAddress: string;
  appPassword: string;
  smtpServer?: string;
  smtpPort?: number;
}

export function setEmailCredentials(input: EmailCredentialsInput): void {
  setSetting(EMAIL_ADDRESS_KEY, input.emailAddress);
  setSetting(EMAIL_APP_PASSWORD_KEY, input.appPassword);
  if (input.smtpServer) setSetting(SMTP_SERVER_KEY, input.smtpServer);
  if (input.smtpPort) setSetting(SMTP_PORT_KEY, String(input.smtpPort));
}

export function clearEmailCredentials(): void {
  clearSetting(EMAIL_ADDRESS_KEY);
  clearSetting(EMAIL_APP_PASSWORD_KEY);
  clearSetting(SMTP_SERVER_KEY);
  clearSetting(SMTP_PORT_KEY);
}

export interface EmailCredentials {
  emailAddress: string;
  appPassword: string;
  smtpServer: string;
  smtpPort: number;
}

/** null when not configured — callers must degrade visibly, never assume this is set. */
export function getEmailCredentials(): EmailCredentials | null {
  const emailAddress = getSetting(EMAIL_ADDRESS_KEY);
  const appPassword = getSetting(EMAIL_APP_PASSWORD_KEY);
  if (!emailAddress || !appPassword) return null;
  return {
    emailAddress,
    appPassword,
    smtpServer: getSetting(SMTP_SERVER_KEY) ?? 'smtp.gmail.com',
    smtpPort: Number(getSetting(SMTP_PORT_KEY) ?? '587'),
  };
}

export interface SettingsStatus {
  anthropicConfigured: boolean;
  emailConfigured: boolean;
}

/** The only thing the frontend is ever allowed to know about stored credentials — that they exist, never what they are. */
export function getSettingsStatus(): SettingsStatus {
  return {
    anthropicConfigured: getAnthropicApiKey() !== null,
    emailConfigured: getEmailCredentials() !== null,
  };
}
