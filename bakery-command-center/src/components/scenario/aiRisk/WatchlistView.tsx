import { useState } from 'react';
import { useApiData, addAiWatchlistItem, deleteAiWatchlistItem, listAiWatchlist, type AiWatchlistItem } from '../../../data/api';

const RISK_CLASS: Record<'low' | 'moderate' | 'high', string> = {
  low: 'border-accent-green/40 text-accent-green',
  moderate: 'border-accent-orange/40 text-accent-orange',
  high: 'border-accent-red/40 text-accent-red',
};

interface WatchlistViewProps {
  canWrite: boolean;
}

/** Manager/hr_admin write, any role can view — per the Stage-1 role-gate proposal. */
export function WatchlistView({ canWrite }: WatchlistViewProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useApiData(listAiWatchlist, [refreshKey]);
  const [risk, setRisk] = useState('');
  const [riskLevel, setRiskLevel] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [keyIndicator, setKeyIndicator] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!risk.trim()) return;
    setSubmitting(true);
    try {
      await addAiWatchlistItem({ risk: risk.trim(), riskLevel, keyIndicator: keyIndicator.trim() || null, reviewDate: reviewDate || null });
      setRisk('');
      setKeyIndicator('');
      setReviewDate('');
      setRefreshKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteAiWatchlistItem(id);
    setRefreshKey((k) => k + 1);
  }

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <h3 className="font-sans text-lg font-semibold text-text-primary">Risks being tracked over time</h3>

      {canWrite && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-bg-panel-raised p-3">
          <input
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            placeholder="Risk name"
            className="rounded-lg border border-border-subtle bg-bg-primary px-3 py-1.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
          />
          <select
            value={riskLevel}
            onChange={(e) => setRiskLevel(e.target.value as 'low' | 'moderate' | 'high')}
            className="rounded-lg border border-border-subtle bg-bg-primary px-2 py-1.5 font-sans text-sm text-text-primary"
          >
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
          <input
            value={keyIndicator}
            onChange={(e) => setKeyIndicator(e.target.value)}
            placeholder="Key indicator (optional)"
            className="rounded-lg border border-border-subtle bg-bg-primary px-3 py-1.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
          />
          <input
            type="date"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
            className="rounded-lg border border-border-subtle bg-bg-primary px-3 py-1.5 font-sans text-sm text-text-primary"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || !risk.trim()}
            className="rounded-lg border border-accent-blue bg-accent-blue px-3 py-1.5 font-sans text-sm font-semibold text-[#04070d] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {state.status === 'loading' && <p className="font-sans text-sm text-text-secondary">Loading…</p>}
        {state.status === 'error' && <p className="font-sans text-sm text-accent-red">{state.message}</p>}
        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <p className="font-sans text-sm text-text-secondary">Nothing on the watchlist yet.</p>
          ) : (
            state.data.map((item: AiWatchlistItem) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle p-3">
                <div>
                  <p className="text-sm text-text-primary">{item.risk}</p>
                  <p className="font-sans text-xs text-text-tertiary">
                    {item.keyIndicator ?? 'No key indicator set'}
                    {item.reviewDate ? ` · review by ${item.reviewDate}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 font-sans text-[11px] font-medium capitalize ${RISK_CLASS[item.riskLevel]}`}>{item.riskLevel}</span>
                  {canWrite && (
                    <button type="button" onClick={() => handleDelete(item.id)} className="font-sans text-xs font-medium text-accent-red hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))
          ))}
      </div>
    </section>
  );
}
