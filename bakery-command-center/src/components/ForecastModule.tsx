import { useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { capacityUtilizationForHires, monthForHires, scenariosFile } from '../data';
import { formatPercent } from '../lib/format';

const { baseline, sliderRange, readoutTemplate } = scenariosFile.forecast13Week;
const wastageTarget = scenariosFile.meta.wastageTarget;

interface ChartRow {
  week: string;
  p10: number;
  p10to25: number;
  p25to75: number;
  p75to90: number;
  baseline: number;
}

const chartData: ChartRow[] = baseline.map((v, i) => {
  const p25 = v * 0.94;
  const p75 = v * 1.06;
  const p10 = v * 0.85;
  const p90 = v * 1.15;
  return {
    week: `W${i + 1}`,
    p10,
    p10to25: p25 - p10,
    p25to75: p75 - p25,
    p75to90: p90 - p75,
    baseline: v,
  };
});

export function ForecastModule() {
  const [hires, setHires] = useState(0);

  const utilization = useMemo(() => capacityUtilizationForHires(hires), [hires]);
  const month = useMemo(() => monthForHires(hires), [hires]);
  const readout = readoutTemplate
    .replace('{value}', formatPercent(utilization, 1).replace('%', ''))
    .replace('{month}', month);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">FORECAST</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">
        13-week wastage &amp; capacity forecast
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        Projected wastage rate trending toward the {formatPercent(wastageTarget, 1)} target, with P25–P75 and
        P10–P90 uncertainty bands.
      </p>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
            <YAxis
              tickFormatter={(v) => `${v}%`}
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
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 12,
              }}
              formatter={(value, name) => {
                if (name === 'baseline') return [`${Number(value).toFixed(2)}%`, 'Projected wastage'];
                return ['', ''];
              }}
              labelFormatter={(l) => `Week ${l}`}
            />
            <ReferenceLine y={wastageTarget} stroke="var(--accent-green)" strokeDasharray="4 4" label={{ value: '1% target', position: 'right', fill: 'var(--accent-green)', fontSize: 10 }} />
            <Area dataKey="p10" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
            <Area dataKey="p10to25" stackId="band" stroke="none" fill="var(--accent-orange)" fillOpacity={0.12} isAnimationActive={false} />
            <Area dataKey="p25to75" stackId="band" stroke="none" fill="var(--accent-orange)" fillOpacity={0.28} isAnimationActive={false} />
            <Area dataKey="p75to90" stackId="band" stroke="none" fill="var(--accent-orange)" fillOpacity={0.12} isAnimationActive={false} />
            <Line dataKey="baseline" stroke="var(--accent-orange)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 grid gap-6 border-t border-border-subtle pt-5 sm:grid-cols-2">
        <div>
          <label htmlFor="hiring-slider" className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">
            INCREMENTAL HEADCOUNT HIRING
          </label>
          <div className="mt-3 flex items-center gap-4">
            <input
              id="hiring-slider"
              type="range"
              min={sliderRange.min}
              max={sliderRange.max}
              step={sliderRange.step}
              value={hires}
              onChange={(e) => setHires(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border-subtle accent-accent-blue"
            />
            <span className="w-14 shrink-0 text-right font-mono font-tabular text-sm text-text-primary">+{hires}</span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-text-secondary">
            {sliderRange.unit} · toward the {scenariosFile.meta.headcountTarget} target (currently{' '}
            {scenariosFile.meta.headcountCurrent})
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-lg border border-border-subtle bg-bg-primary/40 p-4">
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">LIVE READOUT</p>
          <p className="mt-1.5 font-sans font-tabular text-xl font-semibold text-accent-green sm:text-2xl">
            {readout}
          </p>
        </div>
      </div>
    </section>
  );
}
