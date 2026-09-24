import { useApiData, listAiResearch, type AiResearchRecord } from '../../../data/api';
import { relativeTime } from './relativeTime';

type RiskLevel = 'low' | 'moderate' | 'high';
const RISK_ROWS: RiskLevel[] = ['high', 'moderate', 'low']; // worst first, top to bottom
const CONFIDENCE_COLS: RiskLevel[] = ['low', 'moderate', 'high']; // worst first, left to right

const RISK_ROW_CLASS: Record<RiskLevel, string> = {
  high: 'border-accent-red/40 bg-accent-red/10',
  moderate: 'border-accent-orange/40 bg-accent-orange/10',
  low: 'border-accent-green/40 bg-accent-green/10',
};

/** Aggregates every saved research record's real overallRisk/confidence pair
 * into a 3x3 grid — never a fabricated time-series (both fields already
 * exist per record, computed at research time, nothing derived here beyond
 * counting). Colored by risk row only, not a combined score — there's no
 * real single "severity" formula that would combine two independent
 * categorical fields, so this doesn't invent one. */
function RiskSeverityMatrix({ records }: { records: AiResearchRecord[] }) {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = `${r.result.overallRisk}|${r.result.confidence}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-center">
        <thead>
          <tr>
            <th className="p-2" />
            {CONFIDENCE_COLS.map((c) => (
              <th key={c} className="p-2 font-sans text-xs font-medium capitalize text-text-secondary">
                {c} confidence
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RISK_ROWS.map((risk) => (
            <tr key={risk}>
              <th className="p-2 text-right font-sans text-xs font-medium capitalize text-text-secondary">{risk} risk</th>
              {CONFIDENCE_COLS.map((conf) => {
                const count = counts.get(`${risk}|${conf}`) ?? 0;
                return (
                  <td key={conf} className="p-1">
                    <div className={`flex h-16 items-center justify-center rounded-lg border ${RISK_ROW_CLASS[risk]}`}>
                      <span className="font-sans font-tabular text-xl font-semibold text-text-primary">{count}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface HistoryViewProps {
  onOpen: (research: AiResearchRecord) => void;
}

/** Saved Research / History — secondary nav, not part of the main flow. */
export function HistoryView({ onOpen }: HistoryViewProps) {
  const state = useApiData(listAiResearch, []);

  return (
    <div className="flex flex-col gap-6">
      {state.status === 'ready' && state.data.length > 0 && (
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-xs font-medium text-text-tertiary">Risk Severity Matrix</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Where risk clusters across everything researched</h3>
          <p className="mt-1 font-sans text-xs text-text-tertiary">
            Each cell counts saved research runs by their actual computed risk and confidence — not a trend, a snapshot of {state.data.length} run
            {state.data.length === 1 ? '' : 's'} to date.
          </p>
          <div className="mt-4">
            <RiskSeverityMatrix records={state.data} />
          </div>
        </section>
      )}

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
    </div>
  );
}
