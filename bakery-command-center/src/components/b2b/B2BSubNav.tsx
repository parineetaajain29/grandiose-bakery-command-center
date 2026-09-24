// 'Production load' was removed (Phase D follow-up): b2b.capacity has no
// field beyond what Overview's CapacityEconomics panel already shows in
// full — a dedicated tab would only have repeated it, so it was dropped
// rather than padded, same honesty standard as removing Company Profile.
const TABS = ['Overview', 'Client list', 'Orders', 'Receivables'] as const;

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
