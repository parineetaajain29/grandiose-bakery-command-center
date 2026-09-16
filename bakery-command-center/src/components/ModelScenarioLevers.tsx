import { scenariosFile } from '../data';

interface ModelScenarioLeversProps {
  hiring: number;
  onHiringChange: (v: number) => void;
  wastageTargetPct: number;
  onWastageTargetChange: (v: number) => void;
}

const { meta } = scenariosFile;
const currentWastagePct = Number(
  ((scenariosFile.scenarios.actuals.months.Jul.kpis.wastageCost.value / scenariosFile.scenarios.actuals.months.Jul.kpis.revenue.value) * 100).toFixed(1),
);

export function ModelScenarioLevers({ hiring, onHiringChange, wastageTargetPct, onWastageTargetChange }: ModelScenarioLeversProps) {
  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Levers</p>
      <h2 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Build your what-if</h2>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="model-hiring" className="font-sans text-xs font-medium text-text-tertiary">
              Incremental Hiring
            </label>
            <span className="font-sans font-tabular text-sm text-text-primary">+{hiring}</span>
          </div>
          <input
            id="model-hiring"
            type="range"
            min={0}
            max={meta.headcountTarget - meta.headcountCurrent}
            step={1}
            value={hiring}
            onChange={(e) => onHiringChange(Number(e.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-accent-blue"
          />
          <p className="mt-2 font-sans text-xs text-text-tertiary">
            {meta.headcountCurrent} → {meta.headcountCurrent + hiring} of {meta.headcountTarget} target headcount
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="model-wastage" className="font-sans text-xs font-medium text-text-tertiary">
              Wastage Target
            </label>
            <span className="font-sans font-tabular text-sm text-text-primary">{wastageTargetPct.toFixed(1)}%</span>
          </div>
          <input
            id="model-wastage"
            type="range"
            min={meta.wastageTarget}
            max={currentWastagePct}
            step={0.1}
            value={wastageTargetPct}
            onChange={(e) => onWastageTargetChange(Number(e.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-accent-orange"
          />
          <p className="mt-2 font-sans text-xs text-text-tertiary">
            {currentWastagePct}% actual → {meta.wastageTarget}% target
          </p>
        </div>
      </div>
    </section>
  );
}
