import type { ScenarioKey } from '../data';

const TABS: { key: ScenarioKey; label: string }[] = [
  { key: 'actuals', label: 'Actuals' },
  { key: 'gmTargetPlan', label: 'GM Target Plan' },
  { key: 'efficiencyCase', label: 'Efficiency Case' },
  { key: 'expansionCase', label: 'Expansion Case' },
  { key: 'modelScenario', label: 'Model a scenario' },
];

interface ScenarioTabsProps {
  active: ScenarioKey;
  onChange: (key: ScenarioKey) => void;
}

export function ScenarioTabs({ active, onChange }: ScenarioTabsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Scenario">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`rounded-full border px-4 py-2 font-mono text-xs tracking-wide transition-colors ${
              isActive
                ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
