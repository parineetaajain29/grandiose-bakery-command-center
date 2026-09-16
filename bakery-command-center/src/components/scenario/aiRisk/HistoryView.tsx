import { useApiData, listAiResearch, type AiResearchRecord } from '../../../data/api';
import { relativeTime } from './relativeTime';

interface HistoryViewProps {
  onOpen: (research: AiResearchRecord) => void;
}

/** Saved Research / History — secondary nav, not part of the main flow. */
export function HistoryView({ onOpen }: HistoryViewProps) {
  const state = useApiData(listAiResearch, []);

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <h3 className="font-sans text-lg font-semibold text-text-primary">Past research runs</h3>

      <div className="mt-4 flex flex-col gap-2">
        {state.status === 'loading' && <p className="font-sans text-sm text-text-secondary">Loading…</p>}
        {state.status === 'error' && <p className="font-sans text-sm text-accent-red">{state.message}</p>}
        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <p className="font-sans text-sm text-text-secondary">No research has been run yet.</p>
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
                  <p className="font-sans text-xs text-text-tertiary">{r.question}</p>
                </div>
                <span className="font-sans text-xs text-text-tertiary">{relativeTime(r.createdAt)}</span>
              </button>
            ))
          ))}
      </div>
    </section>
  );
}
