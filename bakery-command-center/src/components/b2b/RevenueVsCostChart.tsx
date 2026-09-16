import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { B2BWeeklyTrendPoint } from '../../data';
import { computeWeeklyMargins } from '../../lib/b2bCalc';
import { formatCurrencyPrecise } from '../../lib/format';

interface RevenueVsCostChartProps {
  weeklyTrend: B2BWeeklyTrendPoint[];
}

export function RevenueVsCostChart({ weeklyTrend }: RevenueVsCostChartProps) {
  const rows = computeWeeklyMargins(weeklyTrend).map((r) => ({ ...r, weekLabel: `W${r.week}` }));

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Revenue vs. Service Cost</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">
        Revenue vs. service cost, 13 weeks
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        The gap between the lines is your margin. Watch for convergence.
      </p>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="weekLabel"
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(v / 1000)}K`}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
              }}
              formatter={(value, name) => [
                formatCurrencyPrecise(Number(value)),
                name === 'revenue' ? 'Revenue' : 'Service cost',
              ]}
              labelFormatter={(l) => `Week ${String(l).replace('W', '')}`}
            />
            <Line dataKey="revenue" stroke="var(--accent-green)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="serviceCost" stroke="var(--accent-orange)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex gap-4">
        <div className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-accent-green" /> Revenue
        </div>
        <div className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-accent-orange" /> Service cost
        </div>
      </div>
    </section>
  );
}
