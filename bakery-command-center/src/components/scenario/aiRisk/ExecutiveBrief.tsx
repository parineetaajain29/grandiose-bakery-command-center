import type { AiAssumptionParam, AiResearchRecord } from '../../../data/api';
import type { InflationSensitivityResult, SupplyDisruptionResult } from '../../../lib/scenarioCalc';

const PARAM_LABEL: Record<AiAssumptionParam, string> = {
  raw_material_cost_increase_pct: 'Raw-material cost increase (%)',
  lead_time_extension_days: 'Lead-time extension (days)',
  freight_premium_pct: 'Freight premium (%)',
  stockout_probability: 'Stockout probability',
  safety_stock_days: 'Safety stock (days)',
};

interface ExecutiveBriefProps {
  research: AiResearchRecord;
  values: Record<AiAssumptionParam, number>;
  runResult: { inflation: InflationSensitivityResult; disruption: SupplyDisruptionResult } | null;
}

/** In-app render only — no PDF, no email, this pass (explicitly out of scope). */
export function ExecutiveBrief({ research, values, runResult }: ExecutiveBriefProps) {
  const { result } = research;
  return (
    <div className="mt-4 rounded-lg border border-border-subtle bg-bg-primary/40 p-5">
      <p className="font-mono text-[10px] tracking-[0.14em] text-text-secondary">EXECUTIVE BRIEF</p>
      <h4 className="mt-1 font-sans text-base font-semibold text-text-primary">{result.title}</h4>

      <div className="mt-4 flex flex-col gap-3 text-sm text-text-primary">
        <p>
          <strong className="font-mono text-xs uppercase text-text-secondary">Situation — </strong>
          {research.question}
        </p>
        <p>
          <strong className="font-mono text-xs uppercase text-text-secondary">Why it matters — </strong>
          {result.whyItMattersToGrandiose}
        </p>
        <p>
          <strong className="font-mono text-xs uppercase text-text-secondary">Materials — </strong>
          {result.affectedMaterials.length > 0 ? result.affectedMaterials.join(', ') : 'None specified'}
        </p>

        <div>
          <strong className="font-mono text-xs uppercase text-text-secondary">Assumptions used</strong>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs text-text-secondary">
            {(Object.keys(values) as AiAssumptionParam[]).map((p) => (
              <li key={p}>
                {PARAM_LABEL[p]}: {values[p]}
              </li>
            ))}
          </ul>
        </div>

        {runResult && (
          <div>
            <strong className="font-mono text-xs uppercase text-text-secondary">Result</strong>
            <p className="mt-1 font-mono text-xs text-text-secondary">
              Adjusted cost/unit: AED {runResult.inflation.adjCostFood.toFixed(2)} · Expected stockout cost: AED{' '}
              {runResult.disruption.expectedStockoutCost.toLocaleString('en-AE')}
            </p>
          </div>
        )}

        <div>
          <strong className="font-mono text-xs uppercase text-text-secondary">Actions</strong>
          <p className="mt-1 font-mono text-xs text-text-secondary">Now: {result.actionPlan.now.join('; ')}</p>
          <p className="font-mono text-xs text-text-secondary">30d: {result.actionPlan.in30Days.join('; ')}</p>
          <p className="font-mono text-xs text-text-secondary">90d+: {result.actionPlan.in90DaysPlus.join('; ')}</p>
        </div>

        <p>
          <strong className="font-mono text-xs uppercase text-text-secondary">Decision required — </strong>
          Whether to adopt the assumptions above into planning, or hold for the next research refresh.
        </p>

        <div>
          <strong className="font-mono text-xs uppercase text-text-secondary">Sources ({research.citedSources.length})</strong>
          <ul className="mt-1 flex flex-col gap-0.5">
            {research.citedSources.map((s) => (
              <li key={s.url} className="font-mono text-xs">
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
