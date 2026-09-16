import { useState } from 'react';
import type { AiResearchRecord } from '../../../data/api';
import { DataSourceBadge } from '../../shared/DataSourceBadge';
import { relativeTime } from './relativeTime';
import { BookmarkIcon, BuildingIcon, CalendarIcon, CheckCircleIcon, GlobeIcon, LeafIcon, ShieldIcon, TrendUpIcon } from './icons';

const RISK_TILE: Record<'low' | 'moderate' | 'high', string> = {
  low: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  moderate: 'border-accent-orange/30 bg-accent-orange/10 text-accent-orange',
  high: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
};

// Confidence isn't in RISK_TILE's own domain, but the same red/orange/green
// semantic rule applies consistently: low confidence is the concerning state.
const CONFIDENCE_TILE: Record<'low' | 'moderate' | 'high', string> = {
  low: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
  moderate: 'border-accent-orange/30 bg-accent-orange/10 text-accent-orange',
  high: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
};

function InsightCard({ icon, tint, eyebrow, body }: { icon: React.ReactNode; tint: 'blue' | 'orange' | 'green'; eyebrow: string; body: string }) {
  const tintClass = { blue: 'bg-accent-blue/10 text-accent-blue', orange: 'bg-accent-orange/10 text-accent-orange', green: 'bg-accent-green/10 text-accent-green' }[tint];
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tintClass}`}>{icon}</span>
        <p className="font-sans text-sm font-semibold text-text-primary">{eyebrow}</p>
      </div>
      <p className="mt-2.5 font-sans text-sm text-text-secondary">{body || '—'}</p>
    </div>
  );
}

function StatTile({ icon, label, value, toneClass }: { icon: React.ReactNode; label: string; value: string; toneClass?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-bg-panel p-4">
      <div className="flex items-center gap-1.5 text-text-tertiary">
        {icon}
        <p className="font-sans text-xs font-medium">{label}</p>
      </div>
      {toneClass ? (
        <span className={`inline-flex w-fit items-center rounded-md border px-2 py-1 font-sans text-sm font-semibold capitalize ${toneClass}`}>{value}</span>
      ) : (
        <p className="font-sans text-sm font-semibold text-text-primary">{value}</p>
      )}
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
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="text-text-tertiary" />
          <p className="font-sans text-sm font-semibold text-text-primary">Latest Research Result</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-text-tertiary">{new Date(research.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          {/* Every completed research run is already persisted server-side on
              success — there is no separate draft/unsaved state to act on, so
              this is a status indicator, not an actionable "save" button. */}
          <span className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 font-sans text-xs font-medium text-text-secondary">
            <BookmarkIcon width={14} height={14} />
            Saved
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-sans text-xl font-bold text-text-primary">{result.title}</h3>
            <span className="flex items-center gap-1 rounded-full border border-accent-green/30 bg-accent-green/10 px-2.5 py-0.5 font-sans text-xs font-semibold text-accent-green">
              <CheckCircleIcon width={13} height={13} />
              Completed
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-sans text-xs text-text-tertiary">
            <span>{cached ? `Researched ${relativeTime(research.createdAt)}` : 'Just researched'}</span>
            <span>·</span>
            <button type="button" onClick={onRefresh} disabled={refreshing} className="font-medium text-accent-blue hover:underline disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source="live-research" />
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="rounded-md border border-border-subtle px-3 py-1.5 font-sans text-xs font-medium text-text-primary transition-colors hover:border-accent-blue/50"
          >
            {showSources ? 'Hide' : 'View'} Sources ({research.allSources.length})
          </button>
        </div>
      </div>

      {!research.sourcesRetrieved && (
        <p className="mt-4 rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-3 py-2 font-sans text-sm text-accent-orange">
          Live research unavailable — no external sources retrieved. The summary below is uncited model commentary,
          not sourced research.
        </p>
      )}

      <p className="mt-4 font-sans text-sm text-text-secondary">{result.executiveSummary}</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InsightCard icon={<GlobeIcon />} tint="blue" eyebrow="What is happening?" body={result.whatIsHappening} />
        <InsightCard icon={<BuildingIcon />} tint="orange" eyebrow="Why it matters to Grandiose" body={result.whyItMattersToGrandiose} />
        <InsightCard icon={<TrendUpIcon />} tint="green" eyebrow="What to watch" body={result.whatToWatch} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border-subtle bg-bg-panel p-4">
          <div className="flex items-center gap-1.5 text-text-tertiary">
            <LeafIcon />
            <p className="font-sans text-xs font-medium">Affected Raw Materials</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.affectedMaterials.length > 0 ? (
              result.affectedMaterials.map((m) => (
                <span key={m} className="rounded-full bg-bg-panel-raised px-2.5 py-1 font-sans text-xs text-text-primary">
                  {m}
                </span>
              ))
            ) : (
              <span className="font-sans text-sm text-text-tertiary">—</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <StatTile icon={<ShieldIcon />} label="Overall Risk" value={result.overallRisk} toneClass={RISK_TILE[result.overallRisk]} />
          <StatTile icon={<CalendarIcon />} label="Time Horizon" value={result.horizon || research.params.horizon} />
          <StatTile icon={<ShieldIcon />} label="Confidence" value={result.confidence} toneClass={CONFIDENCE_TILE[result.confidence]} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <button type="button" onClick={() => setShowDetail((v) => !v)} className="font-sans text-sm font-medium text-accent-blue hover:underline">
          {showDetail ? 'Hide' : 'View'} Detailed Research
        </button>
        <button
          type="button"
          onClick={onBuildScenario}
          className="rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90"
        >
          Build Scenario from Research
        </button>
      </div>

      {showDetail && (
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-panel-raised p-4 font-sans text-sm text-text-secondary">
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
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-panel-raised p-4">
          <p className="font-sans text-xs font-semibold text-text-secondary">Cited sources</p>
          {research.citedSources.length === 0 ? (
            <p className="mt-1.5 font-sans text-sm text-text-tertiary">No inline citations were returned.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {research.citedSources.map((s) => (
                <li key={s.url} className="font-sans text-sm">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 font-sans text-xs font-semibold text-text-secondary">All URLs consulted (audit trail)</p>
          {research.allSources.length === 0 ? (
            <p className="mt-1.5 font-sans text-sm text-text-tertiary">None.</p>
          ) : (
            <ul className="mt-1.5 flex max-h-40 flex-col gap-1 overflow-y-auto">
              {research.allSources.map((url) => (
                <li key={url} className="truncate font-mono text-xs text-text-tertiary">
                  {url}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 font-mono text-xs text-text-tertiary">Researched {new Date(research.createdAt).toLocaleString()}</p>
        </div>
      )}
    </section>
  );
}
