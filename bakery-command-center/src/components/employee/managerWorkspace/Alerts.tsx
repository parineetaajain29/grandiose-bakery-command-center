import { useState } from 'react';
import { getAlerts, useApiData } from '../../../data/api';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';

const SEVERITY_CLASS: Record<string, string> = { warning: 'border-accent-orange/40 text-accent-orange', info: 'border-accent-blue/40 text-accent-blue' };

export function Alerts({ onSelectEmployee }: { onSelectEmployee?: (id: string) => void }) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const state = useApiData(() => getAlerts(from, to), [from, to]);

  return (
    <div className="flex flex-col gap-6">
      <PeriodWindowSelector value={window_} onChange={setWindow} />

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Attention Required</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Alerts</h2>
        <p className="mt-1 font-sans text-sm text-text-secondary">Records worth a quick look — not a performance verdict.</p>

        {state.status === 'ready' && state.data.length === 0 && <p className="mt-4 font-sans text-sm text-accent-green">Nothing needs attention right now.</p>}

        <div className="mt-4 flex flex-col gap-2">
          {state.status === 'ready' &&
            state.data.map((alert, i) => (
              <div key={i} className={`flex items-center justify-between gap-3 rounded-card border p-3 ${SEVERITY_CLASS[alert.severity]}`}>
                <p className="font-sans text-sm">{alert.message}</p>
                {alert.employeeId && onSelectEmployee && (
                  <button type="button" onClick={() => onSelectEmployee(alert.employeeId!)} className="shrink-0 font-sans text-xs underline">
                    View
                  </button>
                )}
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
