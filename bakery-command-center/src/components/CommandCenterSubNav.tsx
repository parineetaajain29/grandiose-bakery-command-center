const TABS = ['Overview', 'Performance Tracker'] as const;

export type CommandCenterSubTab = (typeof TABS)[number];

interface CommandCenterSubNavProps {
  active: CommandCenterSubTab;
  onChange: (tab: CommandCenterSubTab) => void;
}

export function CommandCenterSubNav({ active, onChange }: CommandCenterSubNavProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Command Center section">
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
