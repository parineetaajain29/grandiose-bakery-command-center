// Same pattern as CommandCenterSubNav.tsx / B2BSubNav.tsx — a plain pill
// tab row, not a routed sub-page. "Build Presentation" is a second tab on
// this page (never a standalone nav entry) per the spec's own instruction to
// evolve Data Processor rather than add a disconnected tool.
const TABS = ['Process Data', 'Build Presentation'] as const;

export type DataProcessorSubTab = (typeof TABS)[number];

interface DataProcessorSubNavProps {
  active: DataProcessorSubTab;
  onChange: (tab: DataProcessorSubTab) => void;
}

export function DataProcessorSubNav({ active, onChange }: DataProcessorSubNavProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Data Processor section">
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={`rounded-full border px-4 py-2 font-sans text-xs font-medium transition-colors ${
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
