import { useApiData, listAiResearch, type AiResearchRecord } from '../../../data/api';
import { relativeTime } from './relativeTime';

interface HistoryViewProps {
  onOpen: (research: AiResearchRecord) => void;
}

/** Saved Research / History — secondary nav, not part of the main flow. */
export function HistoryView({ onOpen }: HistoryViewProps) {
  const state = useApiData(listAiResearch, []);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">SAVED RESEARCH / HISTORY</p>
      <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Past research runs</h3>

      <div className="mt-4 flex flex-col gap-2">
        {state.status === 'loading' && <p className="font-mono text-xs text-text-secondary">Loading…</p>}
        {state.status === 'error' && <p className="font-mono text-xs text-accent-red">{state.message}</p>}
        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <p className="font-mono text-xs text-text-secondary">No research has been run yet.</p>
          ) : (
            state.data.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(r)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle p-3 text-left transition-colors hover:border-accent-blue/50"
              >
                <div>
                  <p className="text-sm text-text-primary">{r.result.title}</p>
                  <p className="font-mono text-[11px] text-text-secondary">{r.question}</p>
                </div>
                <span className="font-mono text-[11px] text-text-secondary">{relativeTime(r.createdAt)}</span>
              </button>
            ))
          ))}
      </div>
    </section>
  );
}
