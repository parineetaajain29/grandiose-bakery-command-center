import { useState } from 'react';
import type { AiResearchRecord } from '../../../data/api';
import { DataSourceBadge } from '../../shared/DataSourceBadge';
import { relativeTime } from './relativeTime';

const RISK_CLASS: Record<'low' | 'moderate' | 'high', string> = {
  low: 'border-accent-green/40 text-accent-green',
  moderate: 'border-accent-orange/40 text-accent-orange',
  high: 'border-accent-red/40 text-accent-red',
};

function Card({ eyebrow, body }: { eyebrow: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle p-4">
      <p className="font-mono text-[10px] tracking-[0.12em] text-text-secondary">{eyebrow}</p>
      <p className="mt-2 text-sm text-text-primary">{body || '—'}</p>
    </div>
  );
}

interface UnderstandStageProps {
  research: AiResearchRecord;
  cached: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onBuildScenario: () => void;
}

/** Stage 2 of 3 — result title, executive summary, three cards, compact metadata (no division exposure — see MIGRATION-PROVENANCE.html), Sources panel. */
export function UnderstandStage({ research, cached, onRefresh, refreshing, onBuildScenario }: UnderstandStageProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const { result } = research;

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">STAGE 2 OF 3 — UNDERSTAND</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">{result.title}</h3>
        </div>
        <DataSourceBadge source="live-research" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-secondary">
        <span>{cached ? `Researched ${relativeTime(research.createdAt)}` : 'Just researched'}</span>
        <span>·</span>
        <button type="button" onClick={onRefresh} disabled={refreshing} className="text-accent-blue hover:underline disabled:opacity-50">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!research.sourcesRetrieved && (
        <p className="mt-4 rounded-lg border border-accent-orange/40 px-3 py-2 font-mono text-xs text-accent-orange">
          Live research unavailable — no external sources retrieved. The summary below is uncited model commentary,
          not sourced research.
        </p>
      )}

      <p className="mt-4 text-sm text-text-primary">{result.executiveSummary}</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card eyebrow="WHAT IS HAPPENING" body={result.whatIsHappening} />
        <Card eyebrow="WHY IT MATTERS TO GRANDIOSE" body={result.whyItMattersToGrandiose} />
        <Card eyebrow="WHAT TO WATCH" body={result.whatToWatch} />
      </div>

      <div className="mt-5 flex flex-wrap gap-4 border-t border-border-subtle pt-4 font-mono text-xs text-text-secondary">
        <span>
          <strong className="text-text-primary">Materials:</strong> {result.affectedMaterials.length > 0 ? result.affectedMaterials.join(', ') : '—'}
        </span>
        <span>
          <strong className="text-text-primary">Horizon:</strong> {result.horizon || research.params.horizon}
        </span>
        <span>
          <strong className="text-text-primary">Confidence:</strong> {result.confidence}
        </span>
        <span className={`rounded-full border px-2 py-0.5 ${RISK_CLASS[result.overallRisk]}`}>Overall risk: {result.overallRisk}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <button type="button" onClick={() => setShowDetail((v) => !v)} className="font-mono text-xs text-accent-blue hover:underline">
          {showDetail ? 'Hide' : 'View'} Detailed Research
        </button>
        <button type="button" onClick={() => setShowSources((v) => !v)} className="font-mono text-xs text-accent-blue hover:underline">
          {showSources ? 'Hide' : 'View'} Sources ({research.citedSources.length})
        </button>
      </div>

      {showDetail && (
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-primary/40 p-4 font-mono text-xs text-text-secondary">
          <p>
            <strong className="text-text-primary">Question:</strong> {research.question}
          </p>
          <p className="mt-1">
            <strong className="text-text-primary">Filters:</strong> {research.params.riskType} · {research.params.rawMaterial} ·{' '}
            {research.params.geography} · {research.params.depth}
          </p>
        </div>
      )}

      {showSources && (
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-primary/40 p-4">
          <p className="font-mono text-[10px] tracking-[0.1em] text-text-secondary">CITED SOURCES</p>
          {research.citedSources.length === 0 ? (
            <p className="mt-1.5 font-mono text-xs text-text-secondary">No inline citations were returned.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {research.citedSources.map((s) => (
                <li key={s.url} className="font-mono text-xs">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 font-mono text-[10px] tracking-[0.1em] text-text-secondary">ALL URLS CONSULTED (AUDIT TRAIL)</p>
          {research.allSources.length === 0 ? (
            <p className="mt-1.5 font-mono text-xs text-text-secondary">None.</p>
          ) : (
            <ul className="mt-1.5 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {research.allSources.map((url) => (
                <li key={url} className="truncate font-mono text-[11px] text-text-secondary">
                  {url}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 font-mono text-[11px] text-text-secondary">Researched {new Date(research.createdAt).toLocaleString()}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onBuildScenario}
        className="mt-6 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-mono text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90"
      >
        Build Scenario from Research
      </button>
    </section>
  );
}
