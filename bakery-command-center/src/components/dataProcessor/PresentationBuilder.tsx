import { useEffect, useState } from 'react';
import {
  generatePresentation,
  getPresentationBuilderStatus,
  listDataProcessorUploads,
  listPresentationHistory,
  PRESENTATION_MAX_SLIDES,
  PRESENTATION_MIN_SLIDES,
  PRESENTATION_PRESETS,
  type DataProcessorUpload,
  type GeneratedPresentation,
  type PresentationHistoryEntry,
  type PresentationStyle,
} from '../../data/api';

type DataSource = 'dashboard' | 'upload';

const STYLE_OPTIONS: { value: PresentationStyle; label: string; blurb: string }[] = [
  { value: 'executive_summary', label: 'Executive Summary', blurb: 'Fewer, higher-level slides' },
  { value: 'management_analysis', label: 'Management Analysis', blurb: 'Balanced depth' },
  { value: 'detailed_review', label: 'Detailed Review', blurb: 'More granular coverage' },
];

// Real pipeline stages (plan → narrate → chart → build), cycled on a timer
// purely for feedback while the one synchronous request is in flight — never
// tied to a fake percentage, and never claiming a stage is complete before
// the request itself actually returns.
const PROGRESS_STAGES = ['Understanding your request…', 'Analyzing selected data…', 'Building the story…', 'Creating charts…', 'Preparing slides…', 'Finalizing presentation…'];

/** Advances forward on a timer while `active`; the caller is responsible for resetting `index` to 0 itself when it starts a new generation (handleGenerate does this directly in its setState calls, not from an effect body), so this hook never needs to setState synchronously from inside an effect. */
function useProgressStage(active: boolean, index: number, setIndex: (updater: (i: number) => number) => void): string {
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, PROGRESS_STAGES.length - 1)), 1800);
    return () => clearInterval(timer);
  }, [active, setIndex]);
  return PROGRESS_STAGES[index];
}

export function PresentationBuilder() {
  const [status, setStatus] = useState<{ anthropicConfigured: boolean } | null>(null);
  const [objective, setObjective] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(8);
  const [style, setStyle] = useState<PresentationStyle>('management_analysis');
  const [audience, setAudience] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>('dashboard');
  const [uploads, setUploads] = useState<DataProcessorUpload[] | null>(null);
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedPresentation | null>(null);
  const [previewEntry, setPreviewEntry] = useState<PresentationHistoryEntry | null>(null);
  const [history, setHistory] = useState<PresentationHistoryEntry[] | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const progressStage = useProgressStage(busy, progressIndex, setProgressIndex);

  useEffect(() => {
    getPresentationBuilderStatus()
      .then(setStatus)
      .catch(() => setStatus({ anthropicConfigured: false }));
    listPresentationHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
    listDataProcessorUploads()
      .then(setUploads)
      .catch(() => setUploads([]));
  }, []);

  const confirmedUploads = (uploads ?? []).filter((u) => u.status === 'confirmed');

  // Once uploads load (or change), keep the selection valid rather than
  // pointing at nothing or at an upload that's no longer confirmed — picks
  // the most recent confirmed upload as a reasonable default, never forces
  // one silently if the person had already chosen a different one that's
  // still valid.
  useEffect(() => {
    if (dataSource !== 'upload') return;
    if (uploadId !== null && confirmedUploads.some((u) => u.id === uploadId)) return;
    setUploadId(confirmedUploads[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confirmedUploads is derived fresh every render from `uploads`; depending on `uploads` alone avoids re-running this on every render from a new array identity.
  }, [dataSource, uploads]);

  // Revokes the PREVIOUS blob URL whenever downloadUrl changes to a new one, and the current one on unmount — a blob URL that's no longer referenced anywhere is otherwise a memory leak for the lifetime of the tab.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  function applyPreset(preset: (typeof PRESENTATION_PRESETS)[number]) {
    setSelectedPreset(preset.label);
    setObjective(preset.objective);
  }

  async function handleGenerate() {
    if (!objective.trim()) return;
    if (dataSource === 'upload' && uploadId === null) return;
    setBusy(true);
    setProgressIndex(0);
    setError(null);
    setResult(null);
    setPreviewEntry(null);
    try {
      const generated = await generatePresentation({
        objective: objective.trim(),
        slideCount,
        style,
        audience: audience.trim() || undefined,
        dataSource,
        uploadId: dataSource === 'upload' ? (uploadId ?? undefined) : undefined,
      });
      setDownloadUrl(URL.createObjectURL(generated.blob));
      setResult(generated);

      const hist = await listPresentationHistory().catch(() => null);
      if (hist) {
        setHistory(hist);
        setPreviewEntry(hist.find((h) => h.id === generated.historyId) ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">AI Presentation Builder</p>
        <h1 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Build a management presentation</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Describe what the presentation needs to cover — the deck is built from the same verified dashboard figures
          you already see elsewhere, with every number reconciling back to its source.
        </p>
        {status && !status.anthropicConfigured && (
          <p className="mt-3 rounded-lg border border-accent-orange/40 px-3 py-2 font-sans text-xs text-accent-orange">
            The Presentation Builder isn't configured — a manager or HR admin needs to add an Anthropic API key in Settings.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-4">
          <div>
            <p className="font-sans text-xs font-medium text-text-tertiary">Data source</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDataSource('dashboard')}
                className={`rounded-full border px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
                  dataSource === 'dashboard'
                    ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                    : 'border-border-subtle bg-bg-primary text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
                }`}
              >
                Dashboard data
              </button>
              <button
                type="button"
                onClick={() => setDataSource('upload')}
                className={`rounded-full border px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
                  dataSource === 'upload'
                    ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                    : 'border-border-subtle bg-bg-primary text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
                }`}
              >
                Uploaded file
              </button>
            </div>
            {dataSource === 'dashboard' && (
              <p className="mt-1.5 font-sans text-xs text-text-tertiary">Built from the live dashboard figures — Command Center, SKU, B2B, Optimization Lab, and the rest.</p>
            )}
            {dataSource === 'upload' && uploads !== null && confirmedUploads.length === 0 && (
              <p className="mt-1.5 font-sans text-xs text-accent-orange">
                No confirmed uploads yet — process and confirm a file on the Process Data tab first.
              </p>
            )}
            {dataSource === 'upload' && confirmedUploads.length > 0 && (
              <div className="mt-2">
                <label htmlFor="pb-upload" className="font-sans text-xs font-medium text-text-tertiary">
                  Which upload?
                </label>
                <select
                  id="pb-upload"
                  value={uploadId ?? ''}
                  onChange={(e) => setUploadId(Number(e.target.value))}
                  className="mt-1.5 w-full max-w-sm rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
                >
                  {confirmedUploads.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.filename} — {new Date(u.confirmedAt ?? u.uploadedAt).toLocaleDateString('en-AE')}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 font-sans text-xs text-text-tertiary">
                  Built from this file's own interpreted data only — figures come from what you confirmed on the Process Data tab, not the live dashboard.
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="font-sans text-xs font-medium text-text-tertiary">Quick presets</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESENTATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`rounded-full border px-3.5 py-1.5 font-sans text-xs font-medium transition-colors ${
                    selectedPreset === preset.label
                      ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                      : 'border-border-subtle bg-bg-primary text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="pb-objective" className="font-sans text-xs font-medium text-text-tertiary">
              Objective
            </label>
            <textarea
              id="pb-objective"
              value={objective}
              onChange={(e) => {
                setObjective(e.target.value);
                setSelectedPreset(null);
              }}
              rows={3}
              placeholder="e.g. Review wastage performance for the last quarter and recommend where to focus"
              className="mt-1.5 w-full rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="pb-slides" className="font-sans text-xs font-medium text-text-tertiary">
                Number of slides
              </label>
              <input
                id="pb-slides"
                type="number"
                min={PRESENTATION_MIN_SLIDES}
                max={PRESENTATION_MAX_SLIDES}
                value={slideCount}
                onChange={(e) => setSlideCount(Math.max(PRESENTATION_MIN_SLIDES, Math.min(PRESENTATION_MAX_SLIDES, Number(e.target.value) || PRESENTATION_MIN_SLIDES)))}
                className="mt-1.5 w-full rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="pb-audience" className="font-sans text-xs font-medium text-text-tertiary">
                Audience <span className="text-text-tertiary">(optional)</span>
              </label>
              <input
                id="pb-audience"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. CFO"
                className="mt-1.5 w-full rounded-lg border border-border-subtle bg-bg-primary px-3.5 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
              />
            </div>
            <div>
              <p className="font-sans text-xs font-medium text-text-tertiary">Style</p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {STYLE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 font-sans text-xs text-text-secondary">
                    <input type="radio" name="pb-style" checked={style === opt.value} onChange={() => setStyle(opt.value)} className="accent-accent-blue" />
                    <span className="text-text-primary">{opt.label}</span>
                    <span className="text-text-tertiary">— {opt.blurb}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || !objective.trim() || (status ? !status.anthropicConfigured : false) || (dataSource === 'upload' && uploadId === null)}
              className="whitespace-nowrap rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Generating…' : result ? 'Regenerate' : 'Generate presentation'}
            </button>
            {busy && <p className="font-sans text-xs text-text-tertiary">{progressStage}</p>}
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-card border border-accent-red/40 bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-sm text-accent-red">Generation failed.</p>
          <p className="mt-1.5 text-sm text-text-secondary">{error}</p>
        </section>
      )}

      {result && (
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-sans text-lg font-semibold text-text-primary">{result.filename}</h2>
            <a
              href={downloadUrl ?? '#'}
              download={result.filename}
              className="whitespace-nowrap rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90"
            >
              Download PowerPoint
            </a>
          </div>

          {result.warningCount > 0 && (
            <p className="mt-3 rounded-lg border border-accent-orange/40 px-3 py-2 font-sans text-xs text-accent-orange">
              This deck generated with {result.warningCount} quality note{result.warningCount === 1 ? '' : 's'} — review it before sharing.
            </p>
          )}

          {previewEntry && (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <p className="font-sans text-xs font-medium text-text-tertiary">
                {previewEntry.slideCount} slide{previewEntry.slideCount === 1 ? '' : 's'}
                {previewEntry.anyDemoData ? ' · includes illustrative/demo data' : ''}
              </p>
              <ol className="mt-2 flex flex-col gap-1">
                {previewEntry.slideTitles.map((s) => (
                  <li key={s.order} className="font-sans text-sm text-text-primary">
                    {s.order}. {s.title}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {history && history.length > 0 && (
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <h2 className="font-sans text-sm font-semibold text-text-primary">Recent presentations</h2>
          <p className="mt-1 font-sans text-xs text-text-tertiary">
            A record of past requests — the files themselves aren't stored, so re-download isn't available; use Regenerate above with the same objective to rebuild one.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-text-secondary">
                  <th className="whitespace-nowrap py-1.5 pr-4 font-normal">Objective</th>
                  <th className="whitespace-nowrap py-1.5 pr-4 font-normal">Slides</th>
                  <th className="whitespace-nowrap py-1.5 pr-4 font-normal">Style</th>
                  <th className="whitespace-nowrap py-1.5 pr-4 font-normal">Generated</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-border-subtle/50 text-text-primary">
                    <td className="max-w-xs truncate py-1.5 pr-4">{h.objective}</td>
                    <td className="whitespace-nowrap py-1.5 pr-4">{h.slideCount}</td>
                    <td className="whitespace-nowrap py-1.5 pr-4">{h.style.replace(/_/g, ' ')}</td>
                    <td className="whitespace-nowrap py-1.5 pr-4">{new Date(h.createdAt).toLocaleString('en-AE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
