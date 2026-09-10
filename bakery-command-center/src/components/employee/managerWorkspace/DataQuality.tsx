import { useState } from 'react';
import { getDataQuality, useApiData } from '../../../data/api';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';

export function DataQuality({ onSelectEmployee }: { onSelectEmployee: (id: string) => void }) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const state = useApiData(() => getDataQuality(from, to), [from, to]);

  return (
    <div className="flex flex-col gap-6">
      <PeriodWindowSelector value={window_} onChange={setWindow} />

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">DATA QUALITY</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Records worth reviewing</h2>
        <p className="mt-1 font-mono text-sm text-text-secondary">
          Every stored daily log is re-checked against the same validation rules the entry form enforces — anomalies here
          predate the current rules or came from the seeded demo history.
        </p>

        {state.status === 'ready' && state.data.length === 0 && <p className="mt-4 font-mono text-sm text-accent-green">No data-quality issues found.</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle font-mono text-[11px] tracking-wide text-text-secondary">
                <th className="py-2 pr-4 font-normal">Date</th>
                <th className="py-2 pr-4 font-normal">Employee</th>
                <th className="py-2 pr-4 font-normal">Issue</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {state.status === 'ready' &&
                state.data.map((issue, i) => (
                  <tr key={i} className="border-b border-border-subtle/60 last:border-0">
                    <td className="py-2 pr-4 text-text-secondary">{issue.date}</td>
                    <td className="py-2 pr-4">
                      <button type="button" onClick={() => onSelectEmployee(issue.employeeId)} className="text-text-primary hover:text-accent-blue hover:underline">
                        {issue.employeeName ?? issue.employeeId}
                      </button>
                    </td>
                    <td className="py-2 pr-4 text-text-secondary">{issue.issue}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
