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
    <div className="mt-4 rounded-lg border border-border-subtle bg-bg-panel-raised p-5">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-text-tertiary">Executive brief</p>
      <h4 className="mt-1 font-sans text-base font-semibold text-text-primary">{result.title}</h4>

      <div className="mt-4 flex flex-col gap-3 text-sm text-text-primary">
        <p>
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Situation — </strong>
          {research.question}
        </p>
        <p>
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Why it matters — </strong>
          {result.whyItMattersToGrandiose}
        </p>
        <p>
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Materials — </strong>
          {result.affectedMaterials.length > 0 ? result.affectedMaterials.join(', ') : 'None specified'}
        </p>

        <div>
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Assumptions used</strong>
          <ul className="mt-1 flex flex-col gap-0.5 font-sans text-sm text-text-secondary">
            {(Object.keys(values) as AiAssumptionParam[]).map((p) => (
              <li key={p}>
                {PARAM_LABEL[p]}: {values[p]}
              </li>
            ))}
          </ul>
        </div>

        {runResult && (
          <div>
            <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Result</strong>
            <p className="mt-1 font-sans text-sm text-text-secondary">
              Adjusted cost/unit: AED {runResult.inflation.adjCostFood.toFixed(2)} · Expected stockout cost: AED{' '}
              {runResult.disruption.expectedStockoutCost.toLocaleString('en-AE')}
            </p>
          </div>
        )}

        <div>
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Actions</strong>
          <p className="mt-1 font-sans text-sm text-text-secondary">Now: {result.actionPlan.now.join('; ')}</p>
          <p className="font-sans text-sm text-text-secondary">30d: {result.actionPlan.in30Days.join('; ')}</p>
          <p className="font-sans text-sm text-text-secondary">90d+: {result.actionPlan.in90DaysPlus.join('; ')}</p>
        </div>

        <p>
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Decision required — </strong>
          Whether to adopt the assumptions above into planning, or hold for the next research refresh.
        </p>

        <div>
          {/* citedSources (inline url_citation annotations) is legitimately near-empty almost always — the model is
              instructed not to inline-cite inside its pure-JSON answer (Rule 1). allSources (web_search_call.action.sources)
              is the real audit trail of what was actually searched/opened; showing only citedSources here made a
              fully-sourced brief read as having zero sources. */}
          <strong className="font-sans text-xs font-semibold uppercase text-text-tertiary">Sources ({research.allSources.length})</strong>
          {research.citedSources.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {research.citedSources.map((s) => (
                <li key={s.url} className="font-sans text-sm">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {research.allSources.length > 0 && (
            <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
              {research.allSources.map((url) => (
                <li key={url} className="truncate font-mono text-xs text-text-tertiary">
                  <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {research.allSources.length === 0 && research.citedSources.length === 0 && (
            <p className="mt-1 font-sans text-sm text-text-secondary">No external sources retrieved.</p>
          )}
        </div>
      </div>
    </div>
  );
}
