export type PeriodWindow = 7 | 30 | 90;

const WINDOWS: PeriodWindow[] = [7, 30, 90];

interface PeriodWindowSelectorProps {
  value: PeriodWindow;
  onChange: (value: PeriodWindow) => void;
}

/** 7/30/90-day presets (§10) — matches the existing pill-tab visual (src/components/ScenarioTabs.tsx). Custom ranges are not implemented in this build. */
export function PeriodWindowSelector({ value, onChange }: PeriodWindowSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Period">
      {WINDOWS.map((days) => {
        const isActive = days === value;
        return (
          <button
            key={days}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(days)}
            className={`rounded-full border px-4 py-2 font-sans text-xs font-medium transition-colors ${
              isActive
                ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
            }`}
          >
            {days} Days
          </button>
        );
      })}
    </div>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateRangeForWindow(days: PeriodWindow): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: isoDate(from), to: isoDate(to) };
}
