import { useEffect, useState } from 'react';
import type { AuthUser } from '../../data';
import {
  confirmDataProcessorUpload,
  emailDataProcessorReport,
  getDataProcessorExportUrl,
  getDataProcessorStatus,
  uploadFilesForInterpretation,
  type DataProcessorUpload,
  type SettingsStatus,
} from '../../data/api';

const ACCEPTED = '.pdf,.docx,.xlsx,.xls,.csv';

type UploadOutcome = { ok: true; upload: DataProcessorUpload } | { ok: false; reason?: string; message: string };

function ResultsPreview({ upload }: { upload: DataProcessorUpload }) {
  if (!upload.result) return null;
  return (
    <div className="mt-5 flex flex-col gap-5">
      <div>
        <p className="font-sans text-xs font-medium text-text-tertiary">Detected Data Type</p>
        <p className="mt-1 text-sm text-text-primary">{upload.result.detected_data_type}</p>
      </div>
      <div>
        <p className="font-sans text-xs font-medium text-text-tertiary">Summary</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{upload.result.summary}</p>
      </div>
      {upload.result.sheets.map((sheet, i) => (
        <div key={i} className="rounded-card border border-border-subtle p-4">
          <p className="font-sans text-sm font-semibold text-text-primary">{sheet.title || sheet.sheet_name}</p>
          {sheet.rows.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-text-secondary">
                    {sheet.columns.map((c, ci) => (
                      <th key={ci} className="whitespace-nowrap py-1.5 pr-4 font-normal">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 25).map((row, ri) => (
                    <tr key={ri} className="border-b border-border-subtle/50 text-text-primary">
                      {row.map((cell, ci) => (
                        <td key={ci} className="whitespace-nowrap py-1.5 pr-4">
                          {cell === null ? '' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {sheet.rows.length > 25 && (
                <p className="mt-1.5 font-sans text-xs text-text-tertiary">…{sheet.rows.length - 25} more rows in the export.</p>
              )}
            </div>
          )}
          {sheet.insights.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {sheet.insights.map((insight, ii) => (
                <li key={ii} className="font-sans text-xs text-text-secondary">
                  · {insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Workspace() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  useEffect(() => {
    getDataProcessorStatus()
      .then(setStatus)
      .catch(() => setStatus({ anthropicConfigured: false, emailConfigured: false }));
  }, []);

  async function handleInterpret() {
    if (files.length === 0) return;
    setBusy(true);
    setOutcome(null);
    try {
      const upload = await uploadFilesForInterpretation(files);
      setOutcome({ ok: true, upload });
    } catch (err) {
      const reason = (err as { reason?: string })?.reason;
      setOutcome({ ok: false, reason, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!outcome?.ok) return;
    setConfirming(true);
    try {
      const updated = await confirmDataProcessorUpload(outcome.upload.id);
      setOutcome({ ok: true, upload: updated });
    } catch (err) {
      setOutcome({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setConfirming(false);
    }
  }

  async function handleEmail() {
    if (!outcome?.ok || !emailTo.trim()) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await emailDataProcessorReport(outcome.upload.id, emailTo.trim());
      setEmailMsg('Sent.');
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setEmailBusy(false);
    }
  }

  const confirmed = outcome?.ok && outcome.upload.status === 'confirmed';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Data Processor</p>
        <h1 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Upload &amp; interpret a file</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Upload a PDF, Word, Excel, or CSV file for AI interpretation. Files are read in memory and are not stored
          beyond this session; only the interpreted summary is saved once you confirm it.
        </p>
        {status && !status.anthropicConfigured && (
          <p className="mt-3 rounded-lg border border-accent-orange/40 px-3 py-2 font-sans text-xs text-accent-orange">
            AI interpretation isn't configured — a manager or HR admin needs to add an Anthropic API key in Settings.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            multiple
            accept={ACCEPTED}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="font-sans text-xs text-text-secondary file:mr-3 file:rounded-lg file:border file:border-border-subtle file:bg-bg-primary file:px-3 file:py-2 file:font-sans file:text-xs file:text-text-primary"
          />
          <button
            type="button"
            onClick={handleInterpret}
            disabled={busy || files.length === 0 || (status ? !status.anthropicConfigured : false)}
            className="rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Interpreting…' : 'Interpret'}
          </button>
        </div>
      </section>

      {outcome && !outcome.ok && (
        <section className="rounded-card border border-accent-red/40 bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-sm text-accent-red">
            {outcome.reason === 'not_configured' ? "AI interpretation isn't configured." : 'Interpretation failed.'}
          </p>
          <p className="mt-1.5 text-sm text-text-secondary">{outcome.message}</p>
        </section>
      )}

      {outcome?.ok && (
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-sans text-lg font-semibold text-text-primary">{outcome.upload.filename}</h2>
            <span className={`font-sans text-xs font-medium ${confirmed ? 'text-accent-green' : 'text-accent-orange'}`}>
              {confirmed ? 'Confirmed' : 'Awaiting confirmation'}
            </span>
          </div>

          <ResultsPreview upload={outcome.upload} />

          {!confirmed && (
            <div className="mt-5 flex items-center gap-3 border-t border-border-subtle pt-5">
              <p className="flex-1 text-sm text-text-secondary">
                Review the interpretation above, then confirm it before exporting or emailing.
              </p>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="whitespace-nowrap rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {confirming ? 'Confirming…' : 'Confirm this interpretation'}
              </button>
            </div>
          )}

          {confirmed && (
            <div className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={getDataProcessorExportUrl(outcome.upload.id)}
                  className="rounded-lg border border-border-subtle px-4 py-2.5 font-sans text-sm text-text-primary transition-colors hover:border-accent-blue/50"
                >
                  Export as Excel
                </a>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  placeholder="Recipient email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="w-full max-w-xs rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none sm:w-auto"
                />
                <button
                  type="button"
                  onClick={handleEmail}
                  disabled={emailBusy || !emailTo.trim() || (status ? !status.emailConfigured : false)}
                  className="rounded-lg border border-border-subtle px-4 py-2.5 font-sans text-sm text-text-primary transition-colors hover:border-accent-blue/50 disabled:opacity-40"
                >
                  {emailBusy ? 'Sending…' : 'Email report'}
                </button>
              </div>
              {status && !status.emailConfigured && (
                <p className="font-sans text-xs text-accent-orange">
                  Emailing isn't configured — a manager or HR admin needs to add email credentials in Settings.
                </p>
              )}
              {emailMsg && <p className="font-sans text-xs text-text-secondary">{emailMsg}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

interface DataProcessorPageProps {
  user: AuthUser;
}

/**
 * The login wall lives once, at the top of App.tsx, which is why this page
 * never appears in the nav for anyone but manager/hr_admin — tightened
 * server-side too (server/routes/dataProcessor.ts), since this workspace
 * triggers billable Anthropic API calls. This role check is defence-in-depth,
 * matching the same pattern as SettingsPage, not the primary gate.
 */
export function DataProcessorPage({ user }: DataProcessorPageProps) {
  if (user.role !== 'manager' && user.role !== 'hr_admin') {
    return (
      <section className="rounded-card border border-border-subtle bg-bg-panel p-8 text-center">
        <p className="font-sans text-sm text-text-secondary">Data Processor is management only.</p>
      </section>
    );
  }

  return <Workspace />;
}
