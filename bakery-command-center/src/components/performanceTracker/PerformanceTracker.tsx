import { scenariosFile } from '../../data';
import type { AnalysisContext, Kpis } from '../../data';
import { formatPercent } from '../../lib/format';
import { wastagePctFromKpis } from '../../lib/commandCenterSignals';
import { PerformanceTrackerKpiStrip } from './PerformanceTrackerKpiStrip';
import { WastageGauge } from './WastageGauge';
import { CostStructureDonut } from './CostStructureDonut';
import { FoodCostTrendChart } from './FoodCostTrendChart';
import { CategoryPanels } from './CategoryPanels';
import { WastageByDivision } from './WastageByDivision';

const { performanceTracker } = scenariosFile;

const SIGNAL_LABEL: Record<AnalysisContext['signal'], string> = {
  wastage: 'Wastage',
  foodCost: 'Food Cost',
  margin: 'Margin',
  costPerUnit: 'Cost Per Unit',
};

interface PerformanceTrackerProps {
  /** The currently selected Command Center scenario/period's own KPIs —
   * used only to derive a live wastagePct for the Wastage Gauge below.
   * Nothing else on this page reads it; see the file docstring. */
  kpis: Kpis;
  /** Set when arriving via an "Investigate ->" link from Command Center
   * Overview. Optional — direct-tab navigation has no context and behaves
   * exactly as before. */
  context?: AnalysisContext | null;
  onClearContext: () => void;
  /** Next-action handoff to SKU Performance — see App.tsx. SKU Performance
   * itself doesn't consume this yet; this only builds the mechanism. */
  onAnalyzeSkus: (context: AnalysisContext) => void;
}

/**
 * Ported from the Streamlit Performance Tracker (app.py lines 2050-2179) —
 * see scenarios.json's performanceTracker block for the exact source values.
 * This was a fully static, non-scenario/period-aware snapshot in the source.
 *
 * Partially unified (2026-09, per a scope audit that found full unification
 * of every chart here would require 200+ new invented data points and, for
 * Food Cost Trend, is structurally impossible for any scenario but actuals —
 * documented as a named follow-up, not attempted here): the Wastage Gauge
 * now derives live from the caller's `kpis`, the same formula already used
 * in commandCenterSignals.ts and ModelScenarioLevers.tsx. Every other chart
 * on this page — the KPI strip, cost structure donut, by-division bars,
 * food cost trend, category panels — is still Performance Tracker's own
 * fixed benchmark dataset, unrelated to the scenario/period selected on
 * Overview. The banner below says so explicitly; it is not left implicit.
 *
 * Organized as a diagnostic hierarchy: Signal (KPI strip) -> Driver (wastage
 * gauge + cost structure) -> Division/Category (per-division wastage, then
 * operational category panels) -> Trend (food cost trend) -> Next Action.
 */
export function PerformanceTracker({ kpis, context, onClearContext, onAnalyzeSkus }: PerformanceTrackerProps) {
  const worstDivision = performanceTracker.wastageByDivision.reduce((a, b) => (b.wastagePct > a.wastagePct ? b : a));
  const liveWastagePct = wastagePctFromKpis(kpis);

  return (
    <div className="flex flex-col gap-8">
      {context && (
        <div className="rounded-card border border-accent-blue/30 bg-accent-blue/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-xs text-text-tertiary">
              {[context.originPeriodLabel, context.division, SIGNAL_LABEL[context.signal]].filter(Boolean).join(' · ')}
            </p>
            <button
              type="button"
              onClick={onClearContext}
              className="font-sans text-xs font-medium text-accent-blue hover:underline"
            >
              Clear
            </button>
          </div>
          <p className="mt-2 font-sans text-sm text-text-primary">{context.reason}</p>
        </div>
      )}

      <p className="font-sans text-xs text-text-tertiary">
        Except for the Wastage Gauge below, the figures on this page are Performance Tracker's own fixed benchmark
        dataset — independent of the scenario and period selected on Command Center Overview. They are separate
        datasets and are not expected to match.
      </p>

      {/* Signal */}
      <PerformanceTrackerKpiStrip data={performanceTracker} />

      {/* Driver */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-xs font-medium text-text-tertiary">Wastage</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Wastage % vs. target</h3>
          <p className="mt-1 font-sans text-xs text-text-tertiary">Reflects your currently selected scenario &amp; period.</p>
          <div className="mt-4">
            <WastageGauge value={liveWastagePct} />
          </div>
        </section>

        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-xs font-medium text-text-tertiary">Cost Structure</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Where revenue goes</h3>
          <div className="mt-4">
            <CostStructureDonut
              costStructure={performanceTracker.costStructure}
              grossMarginPct={performanceTracker.baseline.grossMarginPct}
              targetFoodCostPct={performanceTracker.targetFoodCostPct}
            />
          </div>
        </section>
      </div>

      {/* Division / Category */}
      <WastageByDivision rows={performanceTracker.wastageByDivision} highlightDivision={context?.division} />

      <CategoryPanels panels={performanceTracker.categoryPanels} />

      {/* Trend */}
      <FoodCostTrendChart
        months={performanceTracker.months}
        foodCostTrend={performanceTracker.foodCostTrend}
        targetFoodCostPct={performanceTracker.targetFoodCostPct}
      />

      {/* Next Action */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            onAnalyzeSkus({
              signal: 'wastage',
              division: worstDivision.division,
              reason: `${worstDivision.division} has the highest wastage rate at ${formatPercent(worstDivision.wastagePct)}.`,
              originPage: 'performanceTracker',
            })
          }
          className="font-sans text-xs font-medium text-accent-blue hover:underline"
        >
          Analyse affected SKUs →
        </button>
      </div>

      <p className="font-sans text-xs text-text-tertiary">
        Financial performance and cost optimization for Grandiose Bakery operations · Bakery division only, catering
        excluded · Figures shown are illustrative benchmarks pending Grandiose-provided actuals.
      </p>
    </div>
  );
}
