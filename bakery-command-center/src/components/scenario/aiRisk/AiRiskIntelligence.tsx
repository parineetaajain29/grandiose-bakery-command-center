import { useEffect, useState } from 'react';
import { runAiResearch, getAiRiskStatus, type AiResearchParams, type AiResearchRecord } from '../../../data/api';
import type { AuthUser } from '../../../data';
import { ResearchStage } from './ResearchStage';
import { UnderstandStage } from './UnderstandStage';
import { PrepareStage } from './PrepareStage';
import { WatchlistView } from './WatchlistView';
import { HistoryView } from './HistoryView';

type SecondaryView = 'flow' | 'watchlist' | 'history';
type Stage = 'research' | 'understand' | 'prepare';

function SecondaryNav({ active, onChange }: { active: SecondaryView; onChange: (v: SecondaryView) => void }) {
  const items: { key: SecondaryView; label: string }[] = [
    { key: 'flow', label: 'Research' },
    { key: 'watchlist', label: 'Watchlist' },
    { key: 'history', label: 'Saved Research / History' },
  ];
  return (
    <div className="flex gap-1 border-b border-border-subtle">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`border-b-2 px-3 py-2 font-mono text-xs tracking-wide transition-colors ${
            active === item.key ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Streamlit's app.py has no such page — this is a genuinely new 5th module, approved as an addition to Scenario & Resilience, not a port. */
function AiRiskWorkspace({ role }: { role: AuthUser['role'] }) {
  const canWriteWatchlist = role === 'manager' || role === 'hr_admin';
  const [view, setView] = useState<SecondaryView>('flow');
  const [stage, setStage] = useState<Stage>('research');
  const [research, setResearch] = useState<AiResearchRecord | null>(null);
  const [cached, setCached] = useState(false);
  const [configured, setConfigured] = useState(true); // optimistic until status loads, matches Data Processor's pattern
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getAiRiskStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  async function submit(params: AiResearchParams, forceRefresh: boolean) {
    setSubmitting(!forceRefresh);
    setRefreshing(forceRefresh);
    setErrorMessage(null);
    try {
      const outcome = await runAiResearch(params, forceRefresh);
      setResearch(outcome.research);
      setCached(outcome.cached);
      setStage('understand');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setRefreshing(false);
    }
  }

  function openFromHistory(r: AiResearchRecord) {
    setResearch(r);
    setCached(true);
    setStage('understand');
    setView('flow');
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">SCENARIO &amp; RESILIENCE — MODULE 5</p>
        <h3 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">AI Risk Intelligence</h3>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">Research live risks. Turn them into decisions.</p>
      </div>

      <SecondaryNav active={view} onChange={setView} />

      {view === 'watchlist' && <WatchlistView canWrite={canWriteWatchlist} />}
      {view === 'history' && <HistoryView onOpen={openFromHistory} />}

      {view === 'flow' && (
        <>
          {stage === 'research' && (
            <ResearchStage configured={configured} submitting={submitting} errorMessage={errorMessage} onSubmit={submit} />
          )}
          {stage === 'understand' && research && (
            <UnderstandStage
              research={research}
              cached={cached}
              refreshing={refreshing}
              onRefresh={() => submit(research.params, true)}
              onBuildScenario={() => setStage('prepare')}
            />
          )}
          {stage === 'prepare' && research && <PrepareStage research={research} />}
        </>
      )}
    </div>
  );
}

interface AiRiskIntelligenceProps {
  role: AuthUser['role'];
}

/**
 * `role` arrives as a prop from the single app-level auth check in App.tsx —
 * no useAuth() call here, no login screen. The role check below is
 * defence-in-depth, not the primary gate: ScenarioResiliencePage.tsx already
 * hides the "5 · AI Risk Intelligence" tab entirely for anyone who isn't
 * manager/hr_admin, and every route this component calls returns 403 for the
 * same roles server-side. This only fires if a stale render somehow reaches
 * this component anyway.
 */
export function AiRiskIntelligence({ role }: AiRiskIntelligenceProps) {
  if (role !== 'manager' && role !== 'hr_admin') {
    return (
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-8 text-center">
        <p className="font-mono text-sm text-text-secondary">You don't have access to this module.</p>
      </section>
    );
  }

  return <AiRiskWorkspace role={role} />;
}
