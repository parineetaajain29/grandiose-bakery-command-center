import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { scenariosFile } from '../../data';
import { computeSupplyDisruption } from '../../lib/scenarioCalc';
import { Slider } from './Slider';
import { DataSourceBadge } from '../shared/DataSourceBadge';

const { supplyDisruption } = scenariosFile.scenarioResilience;
const SCENARIO_NAMES = [...supplyDisruption.scenarios.map((s) => s.name), 'Custom'];

/** Streamlit Module 2 — Supply Disruption Risk (app.py lines 2254-2299). */
export function SupplyDisruptionRisk() {
  const [choice, setChoice] = useState(supplyDisruption.defaultScenario);
  const [customDelay, setCustomDelay] = useState(supplyDisruption.custom.delayDays.default);
  const [customPremium, setCustomPremium] = useState(supplyDisruption.custom.costPremiumPct.default);
  const [customStockout, setCustomStockout] = useState(supplyDisruption.custom.stockoutProbability.default);

  const isCustom = choice === 'Custom';
  const preset = supplyDisruption.scenarios.find((s) => s.name === choice);

  const { delayDays, costPremiumPct, stockoutProbability } = isCustom
    ? { delayDays: customDelay, costPremiumPct: customPremium, stockoutProbability: customStockout }
    : preset!;

  const result = useMemo(
    () => computeSupplyDisruption({ avgDailyCostAed: supplyDisruption.avgDailyCostAed, delayDays, stockoutProbability }),
    [delayDays, stockoutProbability],
  );

  const barRows = [
    { name: 'Cost of holding buffer stock', value: result.bufferStockCost },
    { name: 'Expected cost of stockout', value: result.expectedStockoutCost },
  ];

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">🌪️ NATURAL CALAMITY &amp; SUPPLY DISRUPTION RISK</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Disruption scenario</h3>
        </div>
        <DataSourceBadge source="illustrative" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SCENARIO_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setChoice(name)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${
              choice === name ? 'border-accent-blue text-accent-blue' : 'border-border-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {isCustom ? (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Slider id="dis-delay" label="LEAD-TIME EXTENSION (DAYS)" value={customDelay} min={supplyDisruption.custom.delayDays.min} max={supplyDisruption.custom.delayDays.max} step={supplyDisruption.custom.delayDays.step} unit="d" onChange={setCustomDelay} />
          <Slider id="dis-premium" label="COST PREMIUM (%)" value={customPremium} min={supplyDisruption.custom.costPremiumPct.min} max={supplyDisruption.custom.costPremiumPct.max} step={supplyDisruption.custom.costPremiumPct.step} unit="%" onChange={setCustomPremium} />
          <Slider id="dis-stockout" label="STOCKOUT PROBABILITY" value={customStockout} min={supplyDisruption.custom.stockoutProbability.min} max={supplyDisruption.custom.stockoutProbability.max} step={supplyDisruption.custom.stockoutProbability.step} onChange={setCustomStockout} />
        </div>
      ) : (
        <p className="mt-4 font-mono text-xs text-text-secondary">
          Lead-time extension {delayDays}d · cost premium {costPremiumPct}% · stockout probability {stockoutProbability.toFixed(2)}
        </p>
      )}

      <p className="mt-5 max-w-2xl text-sm text-text-secondary">
        Holding <strong className="text-text-primary">{result.bufferStockDays} days</strong> of buffer stock costs
        approximately <strong className="text-text-primary">AED {result.bufferStockCost.toLocaleString('en-AE')}</strong>. The
        expected cost of not holding buffer, given this scenario's probability, is approximately{' '}
        <strong className="text-text-primary">AED {result.expectedStockoutCost.toLocaleString('en-AE')}</strong>.
      </p>

      <div className="mt-5 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border-subtle)' }} tickLine={false} />
            <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
              formatter={(value) => [`AED ${Number(value).toLocaleString('en-AE')}`, 'Cost']}
            />
            <Bar dataKey="value" fill="var(--accent-orange)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-4 font-mono text-[11px] text-text-secondary">{supplyDisruption.context}</p>
    </section>
  );
}
