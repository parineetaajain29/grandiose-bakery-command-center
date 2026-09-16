import { useState } from 'react';
import { getDepartmentAggregationComparison, getDepartmentsMetrics, useApiData } from '../../../data/api';
import { perDayAverage } from '../../../lib/labourCalc';
import { formatHoursFromMinutes, formatMinutes, formatPercentPrecise } from '../../../lib/format';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';
import { TONE_TEXT_CLASS, efficiencyTone } from '../shared/metricTone';

interface DepartmentAnalysisProps {
  onSelectDepartment: (name: string) => void;
}

export function DepartmentAnalysis({ onSelectDepartment }: DepartmentAnalysisProps) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const { from, to } = dateRangeForWindow(window_);
  const departmentsState = useApiData(() => getDepartmentsMetrics(from, to), [from, to]);

  const [calloutDept, setCalloutDept] = useState<string | null>(null);
  const calloutState = useApiData(
    () => (calloutDept ? getDepartmentAggregationComparison(calloutDept, from, to) : Promise.resolve(null)),
    [calloutDept, from, to],
  );

  return (
    <div className="flex flex-col gap-6">
      <PeriodWindowSelector value={window_} onChange={setWindow} />

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">Department Analysis</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">Compare departments</h2>

        {departmentsState.status === 'ready' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 text-right font-medium">True Efficiency</th>
                  <th className="py-2 pr-4 text-right font-medium">Performance While Working</th>
                  <th className="py-2 pr-4 text-right font-medium">Productive Hours</th>
                  <th className="py-2 pr-4 text-right font-medium">Downtime/day</th>
                  <th className="py-2 pr-4 text-right font-medium">Changeover/day</th>
                  <th className="py-2 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody className="font-sans text-sm">
                {departmentsState.data.map(({ name, result }) => {
                  const tone = efficiencyTone(result.trueEfficiencyPct);
                  return (
                    <tr key={name} className="border-b border-border-subtle/60 last:border-0">
                      <td className="py-2.5 pr-4 text-text-primary">{name}</td>
                      <td className={`py-2.5 pr-4 text-right font-mono font-tabular font-semibold ${TONE_TEXT_CLASS[tone]}`}>
                        {formatPercentPrecise(result.trueEfficiencyPct)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">{formatPercentPrecise(result.performanceWhileWorkingPct)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">{formatHoursFromMinutes(result.productiveMinutes)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">{formatMinutes(perDayAverage(result.downtimeMinutes, result.daysLogged))}</td>
                      <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-secondary">{formatMinutes(perDayAverage(result.changeoverMinutes, result.daysLogged))}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <button type="button" onClick={() => onSelectDepartment(name)} className="font-sans text-xs text-accent-blue hover:underline">
                          View employees
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalloutDept(name)}
                          className="ml-3 font-sans text-xs text-text-secondary hover:text-text-primary"
                        >
                          Aggregation check
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {calloutDept && (
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-xs font-medium text-text-tertiary">Aggregation Method — {calloutDept}</p>
          <h2 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Correct vs. naive-mean efficiency</h2>

          {calloutState.status === 'ready' && calloutState.data && (
            <>
              <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle sm:grid-cols-2">
                <div className="bg-bg-panel p-4">
                  <p className="font-sans text-xs font-medium text-text-tertiary">Correct (Sum Productive ÷ Sum Paid)</p>
                  <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-accent-green">
                    {formatPercentPrecise(calloutState.data.correct.trueEfficiencyPct)}
                  </p>
                </div>
                <div className="bg-bg-panel p-4">
                  <p className="font-sans text-xs font-medium text-text-tertiary">Naive Mean of Each Employee's %</p>
                  <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-accent-orange">
                    {formatPercentPrecise(calloutState.data.naiveMeanTrueEfficiencyPct)}
                  </p>
                </div>
              </div>
              <p className="mt-4 font-sans text-sm text-text-secondary">
                Department efficiency is calculated using total productive time divided by total paid time rather than
                averaging {calloutState.data.employeeCount} employees' individual percentages — this prevents unequal
                shift lengths and day counts from distorting the result.
                {Math.abs(calloutState.data.correct.trueEfficiencyPct - (calloutState.data.naiveMeanTrueEfficiencyPct ?? 0)) > 0.05 && (
                  <>
                    {' '}
                    In this window the two methods diverge by{' '}
                    <span className="text-text-primary">
                      {Math.abs(calloutState.data.correct.trueEfficiencyPct - (calloutState.data.naiveMeanTrueEfficiencyPct ?? 0)).toFixed(2)} points
                    </span>
                    .
                  </>
                )}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
