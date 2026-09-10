import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { projectFoodCostTrend } from '../../lib/performanceCalc';
import { formatPercent } from '../../lib/format';

interface FoodCostTrendChartProps {
  months: string[];
  foodCostTrend: number[];
  targetFoodCostPct: number;
}

type TrendView = 'Historical' | 'Projected (+2 months)';

/** Streamlit food-cost trend + "Projected (+2 months)" toggle (app.py lines 2124-2161). */
export function FoodCostTrendChart({ months, foodCostTrend, targetFoodCostPct }: FoodCostTrendChartProps) {
  const [view, setView] = useState<TrendView>('Historical');
  const isProjected = view === 'Projected (+2 months)';

  const target = useMemo(() => months.map(() => targetFoodCostPct), [months, targetFoodCostPct]);
  const projection = useMemo(() => projectFoodCostTrend(months, foodCostTrend, target), [months, foodCostTrend, target]);

  const rows = useMemo(() => {
    const activeMonths = isProjected ? projection.months : months;
    const activeTrend = isProjected ? projection.trend : foodCostTrend;
    const activeTarget = isProjected ? projection.target : target;
    return activeMonths.map((month, i) => ({
      month,
      actual: i < (isProjected ? projection.historicalCount : months.length) ? activeTrend[i] : null,
      projected: i >= (isProjected ? projection.historicalCount : months.length) - 1 ? activeTrend[i] : null,
      target: activeTarget[i],
    }));
  }, [isProjected, months, foodCostTrend, target, projection]);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">FOOD COST TREND</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Food cost % vs. target</h3>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Trend view">
          {(['Historical', 'Projected (+2 months)'] as TrendView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                view === v ? 'border-accent-blue text-accent-blue' : 'border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
            <YAxis domain={[28, 34]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={38} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
              formatter={(value, name) =>
                value === null || value === undefined
                  ? ['', '']
                  : [formatPercent(Number(value)), name === 'target' ? 'Target' : name === 'projected' ? 'Projected' : 'Food cost %']
              }
            />
            <Line dataKey="target" stroke="var(--accent-green)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="actual" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
            {isProjected && (
              <Line dataKey="projected" stroke="var(--accent-blue)" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 3, strokeDasharray: '' }} connectNulls isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isProjected && (
        <p className="mt-3 font-mono text-[11px] text-text-secondary">
          * Projected months extrapolate the current trend line — illustrative, not a forecast model.
        </p>
      )}
    </section>
  );
}
