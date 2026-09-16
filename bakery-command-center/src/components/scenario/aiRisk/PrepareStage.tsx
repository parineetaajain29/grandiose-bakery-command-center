import { useMemo, useState } from 'react';
import { scenariosFile } from '../../../data';
import { computeHhi, computeInflationSensitivity, computeSupplyDisruption, type HhiResult, type InflationSensitivityResult, type SupplyDisruptionResult } from '../../../lib/scenarioCalc';
import { ASSUMPTION_HAS_MODEL, saveAiResearchAssumptions, type AiAssumptionParam, type AiResearchRecord, type AiSuggestedAssumption } from '../../../data/api';
import { DataSourceBadge } from '../../shared/DataSourceBadge';
import { ExecutiveBrief } from './ExecutiveBrief';

const { performanceTracker, scenarioResilience } = scenariosFile;
const { inflationSensitivity, supplyDisruption, pandemicPreparedness, supplierAlternatives } = scenarioResilience;

const PARAM_ORDER: AiAssumptionParam[] = [
  'raw_material_cost_increase_pct',
  'lead_time_extension_days',
  'freight_premium_pct',
  'stockout_probability',
  'safety_stock_days',
];

const PARAM_LABEL: Record<AiAssumptionParam, string> = {
  raw_material_cost_increase_pct: 'Raw-material cost increase (%)',
  lead_time_extension_days: 'Lead-time extension (days)',
  freight_premium_pct: 'Freight premium (%)',
  stockout_probability: 'Stockout probability',
  safety_stock_days: 'Safety stock (days)',
};

/** "Current" pulled from the exact same scenarios.json defaults each existing module already reads — never a new number invented for this table. */
const CURRENT_VALUES: Record<AiAssumptionParam, number> = {
  raw_material_cost_increase_pct: inflationSensitivity.foodInflationPct.default,
  lead_time_extension_days: supplyDisruption.custom.delayDays.default,
  freight_premium_pct: supplyDisruption.custom.costPremiumPct.default,
  stockout_probability: supplyDisruption.custom.stockoutProbability.default,
  safety_stock_days: pandemicPreparedness.supplyChain.safetyStockDays.default,
};

interface PrepareStageProps {
  research: AiResearchRecord;
}

/** Stage 3 of 3 — assumptions become editable inputs; "Run Scenario" calls only the three existing scenarioCalc.ts functions, unmodified. No new math happens in this component. */
export function PrepareStage({ research }: PrepareStageProps) {
  const { result } = research;

  const initialValues = useMemo(() => {
    const values: Record<AiAssumptionParam, number> = { ...CURRENT_VALUES };
    for (const a of research.userAssumptions ?? result.suggestedAssumptions) {
      values[a.parameter] = a.suggestedValue;
    }
    return values;
  }, [research, result.suggestedAssumptions]);

  const [values, setValues] = useState<Record<AiAssumptionParam, number>>(initialValues);
  const [runResult, setRunResult] = useState<{ inflation: InflationSensitivityResult; disruption: SupplyDisruptionResult } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [spendMix, setSpendMix] = useState(() => (result.suggestedSpendMix ?? []).map((r) => ({ ...r })));
  const [hhiResult, setHhiResult] = useState<HhiResult | null>(null);

  const [showBrief, setShowBrief] = useState(false);

  function suggestionFor(param: AiAssumptionParam): AiSuggestedAssumption | undefined {
    return result.suggestedAssumptions.find((a) => a.parameter === param);
  }

  function setValue(param: AiAssumptionParam, v: number) {
    setValues((prev) => ({ ...prev, [param]: v }));
  }

  async function handleRunScenario() {
    const inflation = computeInflationSensitivity({
      baseCost: performanceTracker.baseline.costPerUnit,
      baseFoodCostPct: performanceTracker.baseline.foodCostPct,
      headlineInflationPct: inflationSensitivity.headlineInflationPct.default,
      foodInflationPct: values.raw_material_cost_increase_pct,
      subsidyOffsetAed: inflationSensitivity.subsidyOffsetAed.default,
    });
    const disruption = computeSupplyDisruption({
      avgDailyCostAed: supplyDisruption.avgDailyCostAed,
      delayDays: values.lead_time_extension_days,
      stockoutProbability: values.stockout_probability,
    });
    setRunResult({ inflation, disruption });

    setSaving(true);
    setSaveMsg(null);
    try {
      const assumptions: AiSuggestedAssumption[] = PARAM_ORDER.map((p) => ({
        parameter: p,
        suggestedValue: values[p],
        rationale: suggestionFor(p)?.rationale ?? 'User-entered value — no AI suggestion for this parameter.',
      }));
      await saveAiResearchAssumptions(research.id, assumptions);
      setSaveMsg('Assumptions saved with this research record.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleTestSourcingMix() {
    const shares = spendMix.map((r) => r.sharePct);
    setHhiResult(computeHhi(shares, supplierAlternatives.hhiLowMax, supplierAlternatives.hhiModerateMax));
  }

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <h3 className="font-sans text-lg font-semibold text-text-primary">Turn this research into a decision</h3>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
              <th className="py-2 pr-4 font-medium">Parameter</th>
              <th className="py-2 pr-4 text-right font-medium">Current</th>
              <th className="py-2 pr-4 text-right font-medium">AI Suggested</th>
              <th className="py-2 pr-4 text-right font-medium">Your Value</th>
            </tr>
          </thead>
          <tbody className="font-sans text-sm">
            {PARAM_ORDER.map((param) => {
              const hasModel = ASSUMPTION_HAS_MODEL[param];
              const suggestion = suggestionFor(param);
              return (
                <tr key={param} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-4 text-text-primary">
                    {PARAM_LABEL[param]}
                    {!hasModel && (
                      <span className="ml-2 rounded-full border border-border-subtle px-2 py-0.5 font-sans text-[11px] text-text-tertiary">
                        assumption only — no model
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-text-secondary">{CURRENT_VALUES[param]}</td>
                  <td className="py-2 pr-4 text-right font-mono text-accent-blue">{suggestion ? suggestion.suggestedValue : '—'}</td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      value={values[param]}
                      onChange={(e) => setValue(param, Number(e.target.value))}
                      className="w-24 rounded-lg border border-border-subtle bg-bg-primary px-2 py-1 text-right font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result.suggestedAssumptions.some((a) => a.rationale) && (
        <div className="mt-2 flex flex-col gap-1">
          {result.suggestedAssumptions.map((a) => (
            <p key={a.parameter} className="font-sans text-xs text-text-secondary">
              <strong className="text-text-primary">{PARAM_LABEL[a.parameter]}:</strong> {a.rationale}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleRunScenario}
        disabled={saving}
        className="mt-4 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Run Scenario
      </button>
      {saveMsg && <p className="mt-2 font-sans text-xs text-text-secondary">{saveMsg}</p>}

      {runResult && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border-subtle pt-5 sm:grid-cols-2">
          <div className="rounded-card border border-border-subtle bg-bg-panel p-4">
            <p className="font-sans text-xs font-medium text-text-tertiary">Inflation sensitivity</p>
            <p className="mt-2 font-sans font-tabular text-lg font-semibold text-text-primary">
              AED {runResult.inflation.adjCostFood.toFixed(2)} <span className="text-sm font-normal text-text-secondary">/ unit</span>
            </p>
            <p className="mt-1 font-sans text-xs text-text-secondary">Food cost % adjusted: {runResult.inflation.foodCostPctAdj}%</p>
          </div>
          <div className="rounded-card border border-border-subtle bg-bg-panel p-4">
            <p className="font-sans text-xs font-medium text-text-tertiary">Supply disruption</p>
            <p className="mt-2 font-sans font-tabular text-lg font-semibold text-text-primary">
              AED {runResult.disruption.expectedStockoutCost.toLocaleString('en-AE')}{' '}
              <span className="text-sm font-normal text-text-secondary">expected stockout cost</span>
            </p>
            <p className="mt-1 font-sans text-xs text-text-secondary">
              Buffer stock ({runResult.disruption.bufferStockDays}d): AED {runResult.disruption.bufferStockCost.toLocaleString('en-AE')}
            </p>
            <p className="mt-2 flex items-start gap-1.5 font-sans text-xs text-accent-orange">
              <DataSourceBadge source="illustrative" />
              <span>
                Includes an internal cost assumption (avg. daily cost = AED {supplyDisruption.avgDailyCostAed.toLocaleString('en-AE')}) with no
                external citation anywhere in the source data — see the Migration Provenance Ledger's citation debt list.
              </span>
            </p>
          </div>
        </div>
      )}

      {result.suggestedSpendMix && result.suggestedSpendMix.length > 0 && (
        <div className="mt-6 border-t border-border-subtle pt-5">
          <p className="font-sans text-sm font-semibold text-text-primary">Test suggested sourcing mix</p>
          <p className="mt-1 text-sm text-text-secondary">
            Passes an editable spend mix into the existing HHI function. This never changes the stored default mix in
            Supplier Alternatives.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-left">
              <tbody className="font-sans text-sm">
                {spendMix.map((row, i) => (
                  <tr key={row.origin} className="border-b border-border-subtle/60 last:border-0">
                    <td className="py-2 pr-4 text-text-primary">{row.origin}</td>
                    <td className="py-2 pr-4 text-right">
                      <input
                        type="number"
                        value={row.sharePct}
                        onChange={(e) =>
                          setSpendMix((prev) => prev.map((r, idx) => (idx === i ? { ...r, sharePct: Number(e.target.value) } : r)))
                        }
                        className="w-20 rounded-lg border border-border-subtle bg-bg-primary px-2 py-1 text-right font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleTestSourcingMix}
            className="mt-3 rounded-lg border border-border-subtle px-4 py-2 font-sans text-sm text-text-primary transition-colors hover:border-accent-blue/50"
          >
            Test Suggested Sourcing Mix
          </button>
          {hhiResult && (
            <p className="mt-3 font-sans text-sm text-text-primary">
              HHI: <strong className="font-mono">{hhiResult.hhi}</strong> — {hhiResult.riskLabel}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-border-subtle pt-5">
        <p className="font-sans text-sm font-semibold text-text-primary">Action plan</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              ['Now (0–7d)', result.actionPlan.now],
              ['30 days', result.actionPlan.in30Days],
              ['90 days+', result.actionPlan.in90DaysPlus],
            ] as const
          ).map(([label, items]) => (
            <div key={label} className="rounded-card border border-border-subtle bg-bg-panel p-4">
              <p className="font-sans text-xs font-medium text-text-tertiary">{label}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {items.map((item, i) => (
                  <li key={i} className="text-sm text-text-primary">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowBrief((v) => !v)}
        className="mt-6 rounded-lg border border-border-subtle px-4 py-2.5 font-sans text-sm text-text-primary transition-colors hover:border-accent-blue/50"
      >
        {showBrief ? 'Hide' : 'Generate'} Executive Brief
      </button>

      {showBrief && <ExecutiveBrief research={research} values={values} runResult={runResult} />}
    </section>
  );
}
