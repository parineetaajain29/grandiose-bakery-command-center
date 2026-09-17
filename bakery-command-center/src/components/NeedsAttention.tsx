import type { AttentionItem } from '../lib/commandCenterSignals';

interface NeedsAttentionProps {
  items: AttentionItem[];
  onInvestigate: (item: AttentionItem) => void;
}

/**
 * Deterministic, threshold-based read of the current period's own KPIs — see
 * lib/commandCenterSignals.ts for the exact rules. Never AI-generated, never
 * a hardcoded example: renders nothing at all when no rule is triggered for
 * the currently selected scenario/period.
 */
export function NeedsAttention({ items, onInvestigate }: NeedsAttentionProps) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Needs Attention</p>
      <h2 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">
        {items.length} issue{items.length === 1 ? '' : 's'} flagged this period
      </h2>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.signal}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle p-4"
          >
            <div>
              <p className="font-sans text-sm font-semibold text-text-primary">{item.title}</p>
              <p className="mt-1 font-sans text-sm text-text-secondary">{item.reason}</p>
            </div>
            <button
              type="button"
              onClick={() => onInvestigate(item)}
              className="shrink-0 font-sans text-xs font-medium text-accent-blue hover:underline"
            >
              {item.linkLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
