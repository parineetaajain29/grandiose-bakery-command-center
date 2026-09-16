import { scenariosFile } from '../../data';
import { PerformanceTrackerKpiStrip } from './PerformanceTrackerKpiStrip';
import { WastageGauge } from './WastageGauge';
import { CostStructureDonut } from './CostStructureDonut';
import { FoodCostTrendChart } from './FoodCostTrendChart';
import { CategoryPanels } from './CategoryPanels';
import { WastageByDivision } from './WastageByDivision';

const { performanceTracker } = scenariosFile;

/**
 * Ported from the Streamlit Performance Tracker (app.py lines 2050-2179) —
 * see scenarios.json's performanceTracker block for the exact source values.
 * This is a static, non-scenario/period-aware snapshot in the source (a
 * single hardcoded `baseline`), so unlike the rest of Command Center it does
 * not respond to the scenario tabs / period selector above it.
 */
export function PerformanceTracker() {
  return (
    <div className="flex flex-col gap-8">
      <PerformanceTrackerKpiStrip data={performanceTracker} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-xs font-medium text-text-tertiary">Wastage</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Wastage % vs. target</h3>
          <div className="mt-4">
            <WastageGauge value={performanceTracker.baseline.wastagePct} />
          </div>
        </section>

        <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-xs font-medium text-text-tertiary">Cost Structure</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Where revenue goes</h3>
          <div className="mt-4">
            <CostStructureDonut costStructure={performanceTracker.costStructure} grossMarginPct={performanceTracker.baseline.grossMarginPct} />
          </div>
        </section>
      </div>

      <FoodCostTrendChart
        months={performanceTracker.months}
        foodCostTrend={performanceTracker.foodCostTrend}
        targetFoodCostPct={performanceTracker.targetFoodCostPct}
      />

      <CategoryPanels panels={performanceTracker.categoryPanels} />

      <WastageByDivision rows={performanceTracker.wastageByDivision} />

      <p className="font-sans text-xs text-text-tertiary">
        Financial performance and cost optimization for Grandiose Bakery operations · Bakery division only, catering
        excluded · Figures shown are illustrative benchmarks pending Grandiose-provided actuals.
      </p>
    </div>
  );
}
