import type { B2BDelivery } from '../../data';
import { formatCurrencyPrecise } from '../../lib/format';

interface DeliveryFeedProps {
  deliveries: B2BDelivery[];
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function DeliveryFeed({ deliveries }: DeliveryFeedProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">OTIF</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Recent deliveries</h2>

      <div className="mt-4 flex flex-col divide-y divide-border-subtle/60">
        {deliveries.map((d, i) => (
          <div key={`${d.client}-${i}`} className="flex items-center gap-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-bg-primary font-mono text-xs font-semibold text-text-primary">
              {initials(d.client)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans text-sm text-text-primary">{d.client}</p>
              <p className="font-mono text-[11px] text-text-secondary">
                {d.location} · {d.time} ·{' '}
                {d.onTime ? (
                  <span className="text-accent-green">On time</span>
                ) : (
                  <span className="text-accent-red">Late{d.delayMinutes !== undefined ? ` +${d.delayMinutes}m` : ''}</span>
                )}
              </p>
            </div>
            <p className="shrink-0 font-mono font-tabular text-sm text-text-primary">{formatCurrencyPrecise(d.value)}</p>
          </div>
        ))}
        {deliveries.length === 0 && <p className="py-6 text-center font-mono text-xs text-text-secondary">No recent deliveries.</p>}
      </div>
    </section>
  );
}
