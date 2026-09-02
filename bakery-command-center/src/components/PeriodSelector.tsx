import type { PeriodGranularity } from '../data';

interface PeriodSelectorProps {
  granularity: PeriodGranularity;
  onGranularityChange: (g: PeriodGranularity) => void;
  months: string[];
  quarters: string[];
  selectedMonth: string;
  selectedQuarter: string;
  onSelectMonth: (m: string) => void;
  onSelectQuarter: (q: string) => void;
}

const GRANULARITIES: { key: PeriodGranularity; label: string }[] = [
  { key: 'month', label: 'M' },
  { key: 'quarter', label: 'Q' },
  { key: 'ytd', label: 'YTD' },
];

export function PeriodSelector({
  granularity,
  onGranularityChange,
  months,
  quarters,
  selectedMonth,
  selectedQuarter,
  onSelectMonth,
  onSelectQuarter,
}: PeriodSelectorProps) {
  const options = granularity === 'month' ? months : granularity === 'quarter' ? quarters : [];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex overflow-hidden rounded-lg border border-border-subtle">
        {GRANULARITIES.map((g) => {
          const isActive = g.key === granularity;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onGranularityChange(g.key)}
              className={`px-3 py-1.5 font-mono text-xs tracking-wide transition-colors ${
                isActive ? 'bg-accent-blue text-[#04070d]' : 'bg-bg-panel text-text-secondary hover:text-text-primary'
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {options.length > 0 && (
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
          {options.map((opt) => {
            const isMonth = granularity === 'month';
            const isActive = isMonth ? opt === selectedMonth : opt === selectedQuarter;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => (isMonth ? onSelectMonth(opt) : onSelectQuarter(opt))}
                className={`shrink-0 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                  isActive
                    ? 'border-accent-blue text-accent-blue'
                    : 'border-border-subtle text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
