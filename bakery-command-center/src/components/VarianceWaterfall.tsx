import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { VarianceData } from '../data';
import { formatAED } from '../lib/format';

interface VarianceWaterfallProps {
  variance: VarianceData;
}

interface Row {
  name: string;
  base: number;
  delta: number;
  kind: 'total' | 'favorable' | 'unfavorable';
}

const EXPLANATIONS: Record<string, (value: number) => string> = {
  Budget: () => 'The July production-cost budget approved in the GM review — the baseline this month is measured against.',
  Flour: (v) => `Flour & grains ran ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget, tracking a wheat price move on the July purchase order.`,
  'Dairy/Butter': (v) => `Dairy & butter came in ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget — butter is dual-sourced, so this is a mix/price effect rather than a supply gap.`,
  Packaging: (v) => `Packaging landed ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget, helped by a lighter mix of festive-order packaging in July.`,
  Labor: (v) => `Labor cost ran ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget — overtime coverage for the Arabic Bread night shift against a still-below-target headcount.`,
  Wastage: (v) => `Wastage added ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget, consistent with the ~2.3% actual rate still sitting above the 1% target.`,
  Utilities: (v) => `Utilities & ovens came in ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget on lower overnight oven run-time.`,
  Admin: (v) => `Admin & overheads were ${formatAED(Math.abs(v))} ${v < 0 ? 'over' : 'under'} budget, roughly in line with plan.`,
  Actual: () => 'The actual production-cost result booked by division finance for July, after all cost-line variances.',
};

export function VarianceWaterfall({ variance }: VarianceWaterfallProps) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [aiRequested, setAiRequested] = useState<Record<string, boolean>>({});

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [{ name: 'Budget', base: 0, delta: variance.budget, kind: 'total' }];
    let running = variance.budget;
    for (const step of variance.steps) {
      out.push({
        name: step.label,
        base: running,
        delta: step.value,
        kind: step.value >= 0 ? 'favorable' : 'unfavorable',
      });
      running += step.value;
    }
    out.push({ name: 'Actual', base: 0, delta: variance.actual, kind: 'total' });
    return out;
  }, [variance]);

  const netVariance = variance.actual - variance.budget;
  const netTone = netVariance <= 0 ? 'text-accent-orange' : 'text-accent-green';

  const colorFor = (kind: Row['kind']) =>
    kind === 'total' ? 'var(--text-secondary)' : kind === 'favorable' ? 'var(--accent-green)' : 'var(--accent-orange)';

  const active = rows.find((r) => r.name === activeLabel);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">BUDGET VS ACTUAL</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">
            Production cost variance
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-secondary">Click any bar for a plain-English explanation.</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">NET VARIANCE</p>
          <p className={`mt-1 font-sans font-tabular text-2xl font-semibold ${netTone}`}>
            {formatAED(netVariance, { compact: true })}
          </p>
        </div>
      </div>

      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} interval={0} />
            <YAxis
              tickFormatter={(v) => formatAED(v, { compact: true })}
              tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="delta"
              stackId="wf"
              radius={[2, 2, 2, 2]}
              isAnimationActive={false}
              onClick={(d: unknown) => {
                const name = (d as { name?: string })?.name;
                if (name) setActiveLabel((cur) => (cur === name ? null : name));
              }}
              className="cursor-pointer"
            >
              {rows.map((row) => (
                <Cell
                  key={row.name}
                  fill={colorFor(row.kind)}
                  opacity={activeLabel && activeLabel !== row.name ? 0.45 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {active && (
        <div className="mt-2 rounded-lg border border-border-subtle bg-bg-primary/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">{active.name.toUpperCase()}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-primary">
                {EXPLANATIONS[active.name]?.(active.delta) ?? 'No explanation available for this line.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAiRequested((s) => ({ ...s, [active.name]: true }))}
              className="shrink-0 rounded-full border border-accent-blue/50 px-3 py-1.5 font-mono text-[11px] tracking-wide text-accent-blue transition-colors hover:bg-accent-blue/10"
            >
              Generate commentary
            </button>
          </div>
          {aiRequested[active.name] && (
            <p className="mt-3 border-t border-border-subtle pt-3 font-mono text-[11px] text-text-secondary">
              AI-generated commentary is a stretch goal — this build calls no backend. Wiring this button to the
              Anthropic API (the same way the Data Processor's `claude-sonnet-5` calls work) would replace this
              static copy with a live-generated explanation per bar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
