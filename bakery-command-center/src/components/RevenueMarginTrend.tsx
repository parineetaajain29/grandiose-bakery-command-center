import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { scenariosFile } from '../data';
import { formatAED, formatPercent } from '../lib/format';

// Real 12-month actuals (confirmed directly: Aug through Jul, chronological
// order as stored) — always the Actuals scenario's own history, independent
// of whichever scenario/period is selected above it. No target line: GM
// Target Plan only has one real month (Jul) of target data, not 12, so an
// "actual vs. target" trend would need 11 fabricated target points.
const MONTHS = Object.keys(scenariosFile.scenarios.actuals.months);
const CHART_DATA = MONTHS.map((month) => {
  const { kpis } = scenariosFile.scenarios.actuals.months[month as keyof typeof scenariosFile.scenarios.actuals.months];
  return { month, revenue: kpis.revenue.value, grossMargin: kpis.grossMargin.value };
});

export function RevenueMarginTrend() {
  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">12-Month Trend</p>
      <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Revenue &amp; Gross Margin — Actuals</h3>
      <p className="mt-1 font-sans text-xs text-text-tertiary">
        The Actuals scenario's own 12-month history — independent of whichever scenario/period is selected above.
      </p>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={CHART_DATA} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border-subtle)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
            <YAxis
              yAxisId="revenue"
              tickFormatter={(v) => formatAED(v, { compact: true })}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <YAxis yAxisId="margin" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 12 }}
              formatter={(value, name) => (name === 'revenue' ? [formatAED(Number(value)), 'Revenue'] : [formatPercent(Number(value)), 'Gross Margin'])}
            />
            <Line yAxisId="revenue" dataKey="revenue" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            <Line yAxisId="margin" dataKey="grossMargin" stroke="var(--accent-green)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex justify-center gap-5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-blue" />
          <span className="font-sans text-[11px] text-text-secondary">Revenue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-green" />
          <span className="font-sans text-[11px] text-text-secondary">Gross Margin %</span>
        </div>
      </div>
    </section>
  );
}
