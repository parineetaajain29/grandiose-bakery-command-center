import { useState } from 'react';
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

/**
 * Hollow dot + shaded band for points whose productive minutes were self-reported
 * (saved before idle-minutes tracking existed) rather than derived — see
 * TrendPointWithProvenance. The percentage figure itself isn't wrong for these
 * points (True Efficiency/Performance While Working never depended on idle time),
 * but the underlying productive number for them carries a weaker guarantee, and a
 * smooth unbroken line gives no hint of that. Solid dot = calculated from logged
 * categories; hollow dot = typed directly by the employee.
 */
function TrendDot(props: { cx?: number; cy?: number; payload?: { hasLegacyData: boolean } }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const legacy = payload?.hasLegacyData ?? false;
  return <circle cx={cx} cy={cy} r={2.5} fill={legacy ? 'var(--bg-panel)' : 'var(--accent-blue)'} stroke="var(--accent-blue)" strokeWidth={legacy ? 1.5 : 0} />;
}

export function MyPerformance({ user }: MyPerformanceProps) {
  const [window_, setWindow] = useState<PeriodWindow>(30);
  const [metricKey, setMetricKey] = useState<MetricKey>('trueEfficiencyPct');
  const { from, to } = dateRangeForWindow(window_);
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const currentState = useApiData(() => getEmployeeMetrics(user.id, from, to), [user.id, from, to]);
  const trendState = useApiData(() => getEmployeeTrend(user.id, from, to), [user.id, from, to]);

  const rows =
    trendState.status === 'ready'
      ? trendState.data.map((p) => ({ date: p.period, value: metric.extract(p.result), hasLegacyData: p.hasLegacyData }))
      : [];
  const legacyDates = rows.filter((r) => r.hasLegacyData).map((r) => r.date);

  return (
    <div className="flex flex-col gap-6">
      <PeriodWindowSelector value={window_} onChange={setWindow} />

      {currentState.status === 'ready' && (
        <KpiCardGrid>
          <KpiCard eyebrow="True Efficiency (Now)" value={formatPercentPrecise(currentState.data.trueEfficiencyPct)} />
          <KpiCard eyebrow="Performance While Working (Now)" value={formatPercentPrecise(currentState.data.performanceWhileWorkingPct)} />
        </KpiCardGrid>
      )}

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <p className="font-sans text-xs font-medium text-text-tertiary">My Performance</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary">
          {metric.label} — {window_} days
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              className={`rounded-full border px-3 py-1.5 font-sans text-xs font-medium transition-colors ${
                m.key === metricKey
                  ? 'border-accent-blue text-accent-blue'
                  : 'border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {trendState.status === 'loading' && <p className="mt-4 font-sans text-sm text-text-secondary">Loading…</p>}

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
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                  }}
                  formatter={(value) => [formatPercentPrecise(value === null || value === undefined ? null : Number(value)), metric.label]}
                />
                {legacyDates.length > 0 && (
                  <ReferenceArea x1={legacyDates[0]} x2={legacyDates[legacyDates.length - 1]} fill="var(--text-secondary)" fillOpacity={0.08} strokeOpacity={0} />
                )}
                <Line
                  dataKey="value"
                  stroke="var(--accent-blue)"
                  strokeWidth={2}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts' own dot-callback prop type isn't worth fighting here; TrendDot only reads cx/cy/payload.
                  dot={(props: any) => <TrendDot key={props.key} {...props} />}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {legacyDates.length > 0 && (
          <p className="mt-3 font-sans text-xs text-text-tertiary">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full border border-accent-blue align-middle" /> Shaded region, hollow points — productive minutes
            were self-reported before this data-integrity change. Solid points are calculated from logged categories.
          </p>
        )}
      </section>
    </div>
  );
}
