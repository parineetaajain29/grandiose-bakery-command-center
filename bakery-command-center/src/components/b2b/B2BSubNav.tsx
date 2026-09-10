const TABS = ['Overview', 'Client list', 'Orders', 'Production load', 'Receivables'] as const;

export type B2BSubTab = (typeof TABS)[number];

interface B2BSubNavProps {
  active: B2BSubTab;
  onChange: (tab: B2BSubTab) => void;
}

export function B2BSubNav({ active, onChange }: B2BSubNavProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="B2B section">
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
