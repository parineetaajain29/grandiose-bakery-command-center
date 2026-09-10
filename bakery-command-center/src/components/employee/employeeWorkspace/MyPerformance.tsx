import { useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getEmployeeMetrics, getEmployeeTrend, useApiData } from '../../../data/api';
import type { AuthUser } from '../../../data';
import type { LabourResult } from '../../../lib/labourCalc';
import { formatPercentPrecise } from '../../../lib/format';
import { KpiCard, KpiCardGrid } from '../shared/KpiCard';
import { PeriodWindowSelector, dateRangeForWindow, type PeriodWindow } from '../shared/PeriodWindowSelector';

interface MyPerformanceProps {
  user: AuthUser;
}

// Own trend ONLY — no department or bakery series, no comparison, no rank or
// percentile. The two metrics named explicitly for this screen: True
// Efficiency and Performance While Working. Self-awareness over time, not
// positioning against anyone else.
type MetricKey = 'trueEfficiencyPct' | 'performanceWhileWorkingPct';

const METRICS: { key: MetricKey; label: string; extract: (r: LabourResult) => number | null }[] = [
  { key: 'trueEfficiencyPct', label: 'True Efficiency', extract: (r) => r.trueEfficiencyPct },
  { key: 'performanceWhileWorkingPct', label: 'Performance While Working', extract: (r) => r.performanceWhileWorkingPct },
];

export function MyPerformance({ user }: MyPerformanceProps) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const [metricKey, setMetricKey] = useState<MetricKey>('trueEfficiencyPct');
  const { from, to } = dateRangeForWindow(window_);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const currentState = useApiData(() => getEmployeeMetrics(user.id, from, to), [user.id, from, to]);
  const trendState = useApiData(() => getEmployeeTrend(user.id, from, to), [user.id, from, to]);

  const rows =
    trendState.status === 'ready'
      ? trendState.data.map((p) => ({ date: p.period, value: metric.extract(p.result) }))
      : [];

  return (
    <div className="flex flex-col gap-6">
      <PeriodWindowSelector value={window_} onChange={setWindow} />

      {currentState.status === 'ready' && (
        <KpiCardGrid>
          <KpiCard eyebrow="TRUE EFFICIENCY (NOW)" value={formatPercentPrecise(currentState.data.trueEfficiencyPct)} />
          <KpiCard eyebrow="PERFORMANCE WHILE WORKING (NOW)" value={formatPercentPrecise(currentState.data.performanceWhileWorkingPct)} />
        </KpiCardGrid>
      )}

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">MY PERFORMANCE</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">
          {metric.label} — {window_} days
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                m.key === metricKey
                  ? 'border-accent-blue text-accent-blue'
                  : 'border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {trendState.status === 'loading' && <p className="mt-4 font-mono text-sm text-text-secondary">Loading…</p>}

        {trendState.status === 'ready' && (
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 12,
                  }}
                  formatter={(value) => [formatPercentPrecise(value === null || value === undefined ? null : Number(value)), metric.label]}
                />
                <Line dataKey="value" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
