import { useState } from 'react';
import { getCauseBreakdown, useApiData } from '../../../data/api';
import type { CauseBreakdownEntry } from '../../../data';
import { formatMinutes } from '../../../lib/format';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';

function CauseTable({ title, entries }: { title: string; entries: CauseBreakdownEntry[] }) {
  const total = entries.reduce((sum, e) => sum + e.minutes, 0);
  return (
    <div>
      <p className="font-sans text-xs font-medium text-text-tertiary">{title}</p>
      {entries.length === 0 ? (
        <p className="mt-2 font-sans text-xs text-text-secondary">No logged minutes in this window.</p>
      ) : (
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-sans text-[11px] font-medium text-text-secondary">
              <th className="py-1.5 pr-3 font-medium">Cause</th>
              <th className="py-1.5 pr-3 text-right font-medium">Minutes</th>
              <th className="py-1.5 pr-3 text-right font-medium">Records</th>
              <th className="py-1.5 font-medium">Share</th>
            </tr>
          </thead>
          <tbody className="font-sans text-xs">
            {entries.map((e) => (
              <tr key={e.cause} className="border-b border-border-subtle/60 last:border-0">
                <td className={`py-1.5 pr-3 ${e.cause.startsWith('Not recorded') ? 'text-text-secondary italic' : 'text-text-primary'}`}>{e.cause}</td>
                <td className="py-1.5 pr-3 text-right font-mono font-tabular text-text-secondary">{formatMinutes(e.minutes)}</td>
                <td className="py-1.5 pr-3 text-right font-mono font-tabular text-text-secondary">{e.count}</td>
                <td className="py-1.5 font-mono font-tabular text-text-secondary">{total === 0 ? '—' : `${((e.minutes / total) * 100).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function CauseBreakdown() {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const state = useApiData(() => getCauseBreakdown(from, to), [from, to]);

  return (
    <div className="flex flex-col gap-6">
      <PeriodWindowSelector value={window_} onChange={setWindow} />

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Loss Causes</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Downtime and changeover, by cause</h2>
        <p className="mt-1 max-w-2xl font-sans text-sm text-text-secondary">
          Total minutes and record count per cause, per department — whether lost time is a maintenance problem, a
          procurement problem, or a scheduling problem. Records logged before cause tracking started group under "Not
          recorded."
        </p>
      </section>

      {state.status === 'ready' &&
        state.data.map((dept) => (
          <section key={dept.department} className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
            <h3 className="font-sans text-lg font-semibold text-text-primary">{dept.department}</h3>
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <CauseTable title="Downtime" entries={dept.downtime} />
              <CauseTable title="Changeover" entries={dept.changeover} />
            </div>
          </section>
        ))}
    </div>
  );
}
