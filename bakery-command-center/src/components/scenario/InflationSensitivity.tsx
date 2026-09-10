import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { scenariosFile } from '../../data';
import { computeInflationSensitivity } from '../../lib/scenarioCalc';
import { deltaTone, formatPercent } from '../../lib/format';
import { Slider } from './Slider';
import { DataSourceBadge } from '../shared/DataSourceBadge';

const { inflationSensitivity } = scenariosFile.scenarioResilience;
const { baseCost, baseFoodCostPct } = { baseCost: scenariosFile.performanceTracker.baseline.costPerUnit, baseFoodCostPct: scenariosFile.performanceTracker.baseline.foodCostPct };

const TONE_CLASS: Record<'green' | 'red' | 'neutral', string> = {
  green: 'text-accent-green',
  red: 'text-accent-red',
  neutral: 'text-text-secondary',
};

/** formatDelta elsewhere in the app is percent-only (hardcodes a "%" suffix) — these two deltas are AED and percentage-points, so they get their own small formatters rather than misusing it. */
function fmtSignedAed(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}AED ${n.toFixed(2)} vs. current`;
}
function fmtSignedPt(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)} pt vs. current`;
}

function MetricCard({ eyebrow, value, caption, tone = 'neutral' }: { eyebrow: string; value: string; caption?: string; tone?: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-panel p-4">
      <p className="font-mono text-[10px] tracking-[0.14em] text-text-secondary">{eyebrow}</p>
      <p className="mt-2 font-sans font-tabular text-xl font-semibold text-text-primary">{value}</p>
      {caption && <p className={`mt-1 font-mono text-xs ${TONE_CLASS[tone]}`}>{caption}</p>}
    </div>
  );
}

/** Streamlit Module 1 — Inflation Sensitivity (app.py lines 2193-2251). */
export function InflationSensitivity() {
  const [headlineInf, setHeadlineInf] = useState(inflationSensitivity.headlineInflationPct.default);
  const [foodInf, setFoodInf] = useState(inflationSensitivity.foodInflationPct.default);
  const [subsidyOffset, setSubsidyOffset] = useState(inflationSensitivity.subsidyOffsetAed.default);

  const result = useMemo(
    () => computeInflationSensitivity({ baseCost, baseFoodCostPct, headlineInflationPct: headlineInf, foodInflationPct: foodInf, subsidyOffsetAed: subsidyOffset }),
    [headlineInf, foodInf, subsidyOffset],
  );

  const donutRows = [
    { name: 'Base cost', value: baseCost },
    { name: 'Inflation add-on', value: Math.max(result.inflationAddon, 0.001) },
  ];

  const barRows = [
    { name: 'Current', value: baseCost },
    { name: 'Headline scenario', value: result.adjCostHeadline },
    { name: 'Food-inflation scenario', value: result.adjCostFood },
  ];

  const costFoodDelta = result.adjCostFood - baseCost;
  const foodCostPctDelta = result.foodCostPctAdj - baseFoodCostPct;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">🔥 INFLATION-ADJUSTED COST SENSITIVITY</p>
            <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Dual-track inflation input</h3>
          </div>
          <DataSourceBadge source="illustrative" />
        </div>
        <p className="mt-1 font-mono text-xs text-text-secondary">Net of any subsidy/price-cap offset deducted.</p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Slider id="inf-headline" label="HEADLINE INFLATION FORECAST (%)" value={headlineInf} min={inflationSensitivity.headlineInflationPct.min} max={inflationSensitivity.headlineInflationPct.max} step={inflationSensitivity.headlineInflationPct.step} unit="%" onChange={setHeadlineInf} />
          <Slider id="inf-food" label="ACTUAL FOOD-INPUT INFLATION (%)" value={foodInf} min={inflationSensitivity.foodInflationPct.min} max={inflationSensitivity.foodInflationPct.max} step={inflationSensitivity.foodInflationPct.step} unit="%" onChange={setFoodInf} />
          <Slider id="inf-subsidy" label="SUBSIDY / PRICE-CAP OFFSET (AED/UNIT)" value={subsidyOffset} min={inflationSensitivity.subsidyOffsetAed.min} max={inflationSensitivity.subsidyOffsetAed.max} step={inflationSensitivity.subsidyOffsetAed.step} onChange={setSubsidyOffset} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col items-center">
            <div className="relative h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutRows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={1} isAnimationActive={false}>
                    <Cell fill="var(--accent-blue)" stroke="var(--bg-panel)" strokeWidth={2} />
                    <Cell fill="var(--accent-orange)" stroke="var(--bg-panel)" strokeWidth={2} />
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
                    formatter={(value, name) => [`AED ${Number(value).toFixed(2)}`, String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-sans font-tabular text-xl font-semibold text-text-primary">AED {result.netAfterSubsidy.toFixed(2)}</p>
                <p className="font-mono text-[10px] tracking-wide text-text-secondary">net / unit</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-3">
            <MetricCard eyebrow="COST/UNIT — HEADLINE SCENARIO" value={`AED ${result.adjCostHeadline.toFixed(2)}`} />
            <MetricCard
              eyebrow="COST/UNIT — FOOD-INFLATION SCENARIO"
              value={`AED ${result.adjCostFood.toFixed(2)}`}
              caption={fmtSignedAed(costFoodDelta)}
              tone={deltaTone(costFoodDelta, true)}
            />
            <MetricCard
              eyebrow="FOOD COST % — FOOD-INFLATION SCENARIO"
              value={formatPercent(result.foodCostPctAdj)}
              caption={fmtSignedPt(foodCostPctDelta)}
              tone={deltaTone(foodCostPctDelta, true)}
            />
          </div>
        </div>

        <div className="mt-6 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
                formatter={(value) => [`AED ${Number(value).toFixed(2)}`, 'Cost / unit']}
              />
              <Bar dataKey="value" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-4 font-mono text-[11px] text-text-secondary">{inflationSensitivity.context}</p>
      </section>
    </div>
  );
}
