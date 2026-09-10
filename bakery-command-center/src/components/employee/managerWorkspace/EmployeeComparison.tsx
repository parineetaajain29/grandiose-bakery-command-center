import { useState } from 'react';
import { getEmployeeMetrics, getEmployees, useApiData } from '../../../data/api';
import { categorizeLoss, perDayAverage, type LabourResult } from '../../../lib/labourCalc';
import { formatHoursFromMinutes, formatMinutes, formatPercentPrecise } from '../../../lib/format';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';
import { TONE_TEXT_CLASS, efficiencyTone } from '../shared/metricTone';

interface EmployeeComparisonProps {
  departmentName: string;
  onSelectEmployee: (id: string) => void;
}

type TrendStatus = 'Improving' | 'Stable' | 'Needs Review' | 'Insufficient Data';

const TREND_CLASS: Record<TrendStatus, string> = {
  Improving: 'text-accent-green border-accent-green/40',
  Stable: 'text-text-secondary border-border-subtle',
  'Needs Review': 'text-accent-red border-accent-red/40',
  'Insufficient Data': 'text-text-secondary border-border-subtle',
};

interface Row {
  id: string;
  name: string;
  current: LabourResult;
  trend: TrendStatus;
  causeHint: string | null;
}

function previousWindow(from: string, to: string): { from: string; to: string } {
  const spanDays = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (spanDays - 1));
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

export function EmployeeComparison({ departmentName, onSelectEmployee }: EmployeeComparisonProps) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const { from: prevFrom, to: prevTo } = previousWindow(from, to);

  const state = useApiData(async () => {
    const employees = (await getEmployees()).filter((e) => e.department === departmentName);
    const rows: Row[] = await Promise.all(
      employees.map(async (emp) => {
        const [current, previous] = await Promise.all([
          getEmployeeMetrics(emp.id, from, to),
          getEmployeeMetrics(emp.id, prevFrom, prevTo),
        ]);

        let trend: TrendStatus = 'Insufficient Data';
        let causeHint: string | null = null;
        if (current.daysLogged > 0 && previous.daysLogged > 0) {
          const delta = current.trueEfficiencyPct - previous.trueEfficiencyPct;
          trend = delta > 2 ? 'Improving' : delta < -2 ? 'Needs Review' : 'Stable';
          if (trend === 'Needs Review') {
            const loss = categorizeLoss(current);
            if (loss.operationalSharePct !== null && loss.operationalSharePct >= 60) {
              causeHint = `Performance declined, but ${Math.round(loss.operationalSharePct)}% of lost time was linked to operational downtime/changeover.`;
            }
          }
        }

        return { id: emp.id, name: emp.name, current, trend, causeHint };
      }),
    );
    return rows;
  }, [departmentName, from, to, prevFrom, prevTo]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodWindowSelector value={window_} onChange={setWindow} />
        <p className="font-mono text-xs text-text-secondary">Trend vs. the prior {window_}-day window.</p>
      </div>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">EMPLOYEE COMPARISON</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">{departmentName}</h2>

        {state.status === 'loading' && <p className="mt-4 font-mono text-sm text-text-secondary">Loading…</p>}
        {state.status === 'error' && <p className="mt-4 font-mono text-sm text-accent-red">{state.message}</p>}

        {state.status === 'ready' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-subtle font-mono text-[11px] tracking-wide text-text-secondary">
                  <th className="py-2 pr-4 font-normal">Employee</th>
                  <th className="py-2 pr-4 text-right font-normal">True Efficiency</th>
                  <th className="py-2 pr-4 text-right font-normal">Performance While Working</th>
                  <th className="py-2 pr-4 text-right font-normal">Productive Hours</th>
                  <th className="py-2 pr-4 text-right font-normal">Downtime/day</th>
                  <th className="py-2 pr-4 text-right font-normal">Changeover/day</th>
                  <th className="py-2 pr-4 font-normal">Trend</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {state.data.map((row) => {
                  const tone = efficiencyTone(row.current.daysLogged > 0 ? row.current.trueEfficiencyPct : null);
                  return (
                    <tr key={row.id} className="border-b border-border-subtle/60 last:border-0">
                      <td className="py-2.5 pr-4">
                        <button type="button" onClick={() => onSelectEmployee(row.id)} className="text-text-primary hover:text-accent-blue hover:underline">
                          {row.name}
                        </button>
                        {row.causeHint && <p className="mt-0.5 max-w-xs text-[11px] text-text-secondary">{row.causeHint}</p>}
                      </td>
                      <td className={`py-2.5 pr-4 text-right font-tabular font-semibold ${TONE_TEXT_CLASS[tone]}`}>
                        {row.current.daysLogged > 0 ? formatPercentPrecise(row.current.trueEfficiencyPct) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-tabular text-text-secondary">{formatPercentPrecise(row.current.performanceWhileWorkingPct)}</td>
                      <td className="py-2.5 pr-4 text-right font-tabular text-text-secondary">{formatHoursFromMinutes(row.current.productiveMinutes)}</td>
                      <td className="py-2.5 pr-4 text-right font-tabular text-text-secondary">{formatMinutes(perDayAverage(row.current.downtimeMinutes, row.current.daysLogged))}</td>
                      <td className="py-2.5 pr-4 text-right font-tabular text-text-secondary">{formatMinutes(perDayAverage(row.current.changeoverMinutes, row.current.daysLogged))}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${TREND_CLASS[row.trend]}`}>{row.trend}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
