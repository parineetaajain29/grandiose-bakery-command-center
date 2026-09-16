import { useState } from 'react';
import { getWorkforceOverview, useApiData } from '../../../data/api';
import { perDayAverage } from '../../../lib/labourCalc';
import { formatHoursFromMinutes, formatMinutes, formatPercentPrecise } from '../../../lib/format';
import { KpiCard, KpiCardGrid } from '../shared/KpiCard';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';
import { TONE_TEXT_CLASS, efficiencyTone } from '../shared/metricTone';
import { DataSourceBadge } from '../shared/DataSourceBadge';

interface WorkforceOverviewProps {
  onSelectDepartment: (name: string) => void;
}

export function WorkforceOverview({ onSelectDepartment }: WorkforceOverviewProps) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const state = useApiData(() => getWorkforceOverview(from, to), [from, to]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodWindowSelector value={window_} onChange={setWindow} />
        <DataSourceBadge />
      </div>

      {state.status === 'loading' && <p className="font-sans text-sm text-text-secondary">Loading…</p>}
      {state.status === 'error' && <p className="font-sans text-sm text-accent-red">{state.message}</p>}

      {state.status === 'ready' && (
        <>
          <KpiCardGrid>
            <KpiCard eyebrow="Active Employees" value={String(state.data.activeEmployeeCount)} />
            <KpiCard eyebrow="Avg True Efficiency" value={formatPercentPrecise(state.data.bakery.trueEfficiencyPct)} />
            <KpiCard eyebrow="Avg Performance While Working" value={formatPercentPrecise(state.data.bakery.performanceWhileWorkingPct)} />
            <KpiCard
              eyebrow="Total Downtime"
              value={formatMinutes(state.data.bakery.downtimeMinutes)}
              caption={`+ ${formatMinutes(state.data.bakery.changeoverMinutes)} changeover`}
            />
          </KpiCardGrid>

          <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
            <p className="font-sans text-xs font-medium text-text-tertiary">Departments</p>
            <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Department summaries</h2>
            <p className="mt-1 font-sans text-sm text-text-secondary">Click a department to drill into its employees.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
                    <th className="py-2 pr-4 font-medium">Department</th>
                    <th className="py-2 pr-4 text-right font-medium">True Efficiency</th>
                    <th className="py-2 pr-4 text-right font-medium">Performance While Working</th>
                    <th className="py-2 pr-4 text-right font-medium">Productive Hours</th>
                    <th className="py-2 pr-4 text-right font-medium">Downtime/day</th>
                    <th className="py-2 pr-4 text-right font-medium">Changeover/day</th>
                  </tr>
                </thead>
                <tbody className="font-sans text-sm">
                  {state.data.departments.map(({ name, result }) => {
                    const tone = efficiencyTone(result.trueEfficiencyPct);
                    return (
                      <tr
                        key={name}
                        onClick={() => onSelectDepartment(name)}
                        className="cursor-pointer border-b border-border-subtle/60 last:border-0 hover:bg-bg-primary/40"
                      >
                        <td className="py-2.5 pr-4 text-text-primary">{name}</td>
                        <td className={`py-2.5 pr-4 text-right font-mono font-tabular font-semibold ${TONE_TEXT_CLASS[tone]}`}>
                          {formatPercentPrecise(result.trueEfficiencyPct)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">
                          {formatPercentPrecise(result.performanceWhileWorkingPct)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">{formatHoursFromMinutes(result.productiveMinutes)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">
                          {formatMinutes(perDayAverage(result.downtimeMinutes, result.daysLogged))}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">
                          {formatMinutes(perDayAverage(result.changeoverMinutes, result.daysLogged))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
