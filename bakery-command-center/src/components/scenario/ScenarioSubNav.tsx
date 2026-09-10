const TABS = ['1 · Inflation Sensitivity', '2 · Supply Disruption Risk', '3 · Pandemic Preparedness', '4 · Supplier Alternatives'] as const;

export type ScenarioSubTab = (typeof TABS)[number];
export { TABS as SCENARIO_TABS };

interface ScenarioSubNavProps {
  active: ScenarioSubTab;
  onChange: (tab: ScenarioSubTab) => void;
}

export function ScenarioSubNav({ active, onChange }: ScenarioSubNavProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Scenario & Resilience module">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={`rounded-full border px-4 py-2 font-mono text-xs tracking-wide transition-colors ${
              isActive
                ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
