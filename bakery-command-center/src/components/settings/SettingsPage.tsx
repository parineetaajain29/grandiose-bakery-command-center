import { useEffect, useState } from 'react';
import type { AuthUser } from '../../data';
import {
  clearAnthropicKey,
  clearEmailCredentials,
  clearOpenAiKey,
  getAiUsageStats,
  getSettingsStatus,
  saveAiRiskMonthlyCap,
  saveAnthropicKey,
  saveEmailCredentials,
  saveOpenAiKey,
  type AiUsageStats,
  type SettingsStatus,
} from '../../data/api';

const inputClass =
  'mt-1.5 w-full rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none';
const labelClass = 'font-mono text-[11px] tracking-[0.14em] text-text-secondary';

function StatusDot({ configured }: { configured: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${configured ? 'text-accent-green' : 'text-text-secondary'}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${configured ? 'bg-accent-green' : 'bg-text-secondary/50'}`} />
      {configured ? 'Configured' : 'Not configured'}
    </span>
  );
}

/**
 * Management-only (manager/hr_admin) credential entry for the Anthropic API
 * key and Gmail SMTP app password Data Processor needs. Write-only by design
 * (§Phase 7 condition 1) — this screen never receives a stored value back
 * from the server, only a configured/not-configured boolean, so there is
 * nothing here that could echo a secret to the browser even by accident.
 */
function SettingsForm() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [anthropicBusy, setAnthropicBusy] = useState(false);
  const [anthropicMsg, setAnthropicMsg] = useState<string | null>(null);

  const [emailAddress, setEmailAddress] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [smtpServer, setSmtpServer] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const [openAiKey, setOpenAiKey] = useState('');
  const [openAiBusy, setOpenAiBusy] = useState(false);
  const [openAiMsg, setOpenAiMsg] = useState<string | null>(null);

  // null = "user hasn't edited yet" — displayed value falls back to the
  // server's cap at render time (see monthlyCapValue below) instead of via a
  // setState-in-effect sync, which the linter (correctly) flags as
  // unnecessary here.
  const [monthlyCap, setMonthlyCap] = useState<string | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const [capMsg, setCapMsg] = useState<string | null>(null);

  const [usage, setUsage] = useState<AiUsageStats | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  function reloadUsage() {
    getAiUsageStats()
      .then(setUsage)
      .catch((err) => setUsageError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(reloadUsage, []);

  function reloadStatus() {
    getSettingsStatus()
      .then(setStatus)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(reloadStatus, []);

  const monthlyCapValue = monthlyCap ?? String(status?.aiRiskMonthlyCap ?? 200);

  async function handleSaveAnthropic(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setAnthropicBusy(true);
    setAnthropicMsg(null);
    try {
      await saveAnthropicKey(apiKey.trim());
      setApiKey('');
      setAnthropicMsg('Saved.');
      reloadStatus();
    } catch (err) {
      setAnthropicMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAnthropicBusy(false);
    }
  }

  async function handleClearAnthropic() {
    setAnthropicBusy(true);
    setAnthropicMsg(null);
    try {
      await clearAnthropicKey();
      setAnthropicMsg('Cleared.');
      reloadStatus();
    } catch (err) {
      setAnthropicMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAnthropicBusy(false);
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailAddress.trim() || !appPassword.trim()) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await saveEmailCredentials({
        emailAddress: emailAddress.trim(),
        appPassword: appPassword.trim(),
        smtpServer: smtpServer.trim() || 'smtp.gmail.com',
        smtpPort: Number(smtpPort) || 587,
      });
      setEmailAddress('');
      setAppPassword('');
      setEmailMsg('Saved.');
      reloadStatus();
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleClearEmail() {
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await clearEmailCredentials();
      setEmailMsg('Cleared.');
      reloadStatus();
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleSaveOpenAi(e: React.FormEvent) {
    e.preventDefault();
    if (!openAiKey.trim()) return;
    setOpenAiBusy(true);
    setOpenAiMsg(null);
    try {
      await saveOpenAiKey(openAiKey.trim());
      setOpenAiKey('');
      setOpenAiMsg('Saved.');
      reloadStatus();
    } catch (err) {
      setOpenAiMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setOpenAiBusy(false);
    }
  }

  async function handleClearOpenAi() {
    setOpenAiBusy(true);
    setOpenAiMsg(null);
    try {
      await clearOpenAiKey();
      setOpenAiMsg('Cleared.');
      reloadStatus();
    } catch (err) {
      setOpenAiMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setOpenAiBusy(false);
    }
  }

  async function handleSaveCap(e: React.FormEvent) {
    e.preventDefault();
    const cap = Number(monthlyCapValue);
    if (!Number.isFinite(cap) || cap < 1) return;
    setCapBusy(true);
    setCapMsg(null);
    try {
      await saveAiRiskMonthlyCap(cap);
      setCapMsg('Saved.');
      reloadUsage();
    } catch (err) {
      setCapMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setCapBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">SETTINGS</p>
        <h1 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Integration credentials</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Stored write-only in this app's local database. Nothing entered here is ever displayed again once saved —
          only whether a value is currently set. Clearing a credential removes it immediately.
        </p>
        {loadError && <p className="mt-3 font-mono text-xs text-accent-red">{loadError}</p>}
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-sans text-lg font-semibold text-text-primary">Anthropic API key</h2>
          {status && <StatusDot configured={status.anthropicConfigured} />}
        </div>
        <p className="mt-1.5 text-sm text-text-secondary">Required for Data Processor's AI interpretation step.</p>

        <form onSubmit={handleSaveAnthropic} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className={labelClass} htmlFor="anthropic-key">
              API KEY
            </label>
            <input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={anthropicBusy || !apiKey.trim()}
              className="rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-mono text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleClearAnthropic}
              disabled={anthropicBusy || !status?.anthropicConfigured}
              className="rounded-lg border border-border-subtle px-4 py-2.5 font-mono text-sm text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </form>
        {anthropicMsg && <p className="mt-2 font-mono text-xs text-text-secondary">{anthropicMsg}</p>}
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-sans text-lg font-semibold text-text-primary">Email (SMTP) credentials</h2>
          {status && <StatusDot configured={status.emailConfigured} />}
        </div>
        <p className="mt-1.5 text-sm text-text-secondary">
          Required for Data Processor's "Email report" action. Use a Gmail address and an app password (not the
          account password) — see Google Account &gt; Security &gt; App passwords.
        </p>

        <form onSubmit={handleSaveEmail} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="email-address">
                EMAIL ADDRESS
              </label>
              <input
                id="email-address"
                type="email"
                autoComplete="off"
                placeholder="reports@grandiosebakery.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="email-app-password">
                APP PASSWORD
              </label>
              <input
                id="email-app-password"
                type="password"
                autoComplete="off"
                placeholder="16-character app password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="smtp-server">
                SMTP SERVER
              </label>
              <input
                id="smtp-server"
                type="text"
                value={smtpServer}
                onChange={(e) => setSmtpServer(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="smtp-port">
                SMTP PORT
              </label>
              <input
                id="smtp-port"
                type="text"
                inputMode="numeric"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ''))}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={emailBusy || !emailAddress.trim() || !appPassword.trim()}
              className="rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-mono text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleClearEmail}
              disabled={emailBusy || !status?.emailConfigured}
              className="rounded-lg border border-border-subtle px-4 py-2.5 font-mono text-sm text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </form>
        {emailMsg && <p className="mt-2 font-mono text-xs text-text-secondary">{emailMsg}</p>}
      </section>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-sans text-lg font-semibold text-text-primary">OpenAI API key</h2>
          {status && <StatusDot configured={status.openAiConfigured ?? false} />}
        </div>
        <p className="mt-1.5 text-sm text-text-secondary">
          Required for AI Risk Intelligence's live web research (Scenario &amp; Resilience). A second, separate key from
          the Anthropic one above — one Grandiose account for research, one for report interpretation.
        </p>

        <form onSubmit={handleSaveOpenAi} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className={labelClass} htmlFor="openai-key">
              API KEY
            </label>
            <input
              id="openai-key"
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={openAiBusy || !openAiKey.trim()}
              className="rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-mono text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleClearOpenAi}
              disabled={openAiBusy || !status?.openAiConfigured}
              className="rounded-lg border border-border-subtle px-4 py-2.5 font-mono text-sm text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </form>
        {openAiMsg && <p className="mt-2 font-mono text-xs text-text-secondary">{openAiMsg}</p>}

        <div className="mt-5 border-t border-border-subtle pt-5">
          <p className="text-sm text-text-primary">Monthly research cap</p>
          <p className="mt-1 text-sm text-text-secondary">
            Web search bills per search. This is an application-level limit only — the bypass-proof limit is a billing
            cap set on the OpenAI account itself, which someone at Grandiose still needs to configure separately.
          </p>
          <form onSubmit={handleSaveCap} className="mt-3 flex items-end gap-2">
            <div>
              <label className={labelClass} htmlFor="ai-risk-cap">
                SEARCHES / MONTH
              </label>
              <input
                id="ai-risk-cap"
                type="text"
                inputMode="numeric"
                value={monthlyCapValue}
                onChange={(e) => setMonthlyCap(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} w-32`}
              />
            </div>
            <button
              type="submit"
              disabled={capBusy || !monthlyCapValue || Number(monthlyCapValue) < 1}
              className="rounded-lg border border-border-subtle px-4 py-2.5 font-mono text-sm text-text-primary transition-colors hover:border-accent-blue/50 disabled:opacity-50"
            >
              Save cap
            </button>
          </form>
          {capMsg && <p className="mt-2 font-mono text-xs text-text-secondary">{capMsg}</p>}
        </div>

        <div className="mt-5 border-t border-border-subtle pt-5">
          <p className="text-sm text-text-primary">Usage this month</p>
          {usageError && <p className="mt-1 font-mono text-xs text-accent-red">{usageError}</p>}
          {usage && (
            <>
              <p className="mt-1 font-mono text-sm text-text-primary">
                {usage.usedThisMonth} / {usage.monthlyCap} searches
              </p>
              {usage.topUsers.length > 0 && (
                <div className="mt-2">
                  <p className="font-mono text-[10px] tracking-[0.1em] text-text-secondary">TOP 5 USERS</p>
                  <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs text-text-secondary">
                    {usage.topUsers.map((u) => (
                      <li key={u.employeeId}>
                        {u.employeeId} — {u.count}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** Gated exactly like Employee Portal — same useAuth() hook, no new auth mechanism — but restricted to manager/hr_admin since this holds real secrets. */
interface SettingsPageProps {
  user: AuthUser;
}

/**
 * The login wall itself lives once, at the top of App.tsx, which is why
 * Settings never appears in the nav for anyone but manager/hr_admin. This
 * role check is defence-in-depth, not the primary gate — kept deliberately
 * in case nav filtering is ever loosened or bypassed some other way.
 */
export function SettingsPage({ user }: SettingsPageProps) {
  if (user.role !== 'manager' && user.role !== 'hr_admin') {
    return (
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-8 text-center">
        <p className="font-mono text-sm text-text-secondary">Settings is management only.</p>
      </section>
    );
  }

  return <SettingsForm />;
}
