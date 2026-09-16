import type { B2BCapacity } from '../../data';
import { computeMarginalMarginPct } from '../../lib/b2bCalc';
import { formatPercentPrecise } from '../../lib/format';

interface CapacityEconomicsProps {
  capacity: B2BCapacity;
}

const SEGMENTS: { key: 'retailPct' | 'b2bPct' | 'idlePct'; label: string; colorClass: string }[] = [
  { key: 'retailPct', label: 'Retail', colorClass: 'bg-accent-blue' },
  { key: 'b2bPct', label: 'B2B', colorClass: 'bg-accent-green' },
  { key: 'idlePct', label: 'Idle', colorClass: 'bg-border-subtle' },
];

export function CapacityEconomics({ capacity }: CapacityEconomicsProps) {
  const idleMarginalPct = computeMarginalMarginPct(capacity.marginalScenarios.idleCapacityOrder);
  const overtimeMarginalPct = computeMarginalMarginPct(capacity.marginalScenarios.overtimeOrder);

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Capacity Economics</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Oven capacity &amp; marginal margin</h2>

      <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full border border-border-subtle">
        {SEGMENTS.map((seg) => (
          <div
            key={seg.key}
            className={seg.colorClass}
            style={{ width: `${capacity[seg.key]}%` }}
            title={`${seg.label}: ${formatPercentPrecise(capacity[seg.key])}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {SEGMENTS.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
            <span className={`h-2 w-2 rounded-full ${seg.colorClass}`} />
            {seg.label} ({formatPercentPrecise(capacity[seg.key])})
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle sm:grid-cols-2">
        <div className="bg-bg-panel p-4">
          <p className="font-sans text-xs font-medium text-text-tertiary">Marginal Margin — Idle Capacity Order</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-accent-green">
            {formatPercentPrecise(idleMarginalPct)}
          </p>
        </div>
        <div className="bg-bg-panel p-4">
          <p className="font-sans text-xs font-medium text-text-tertiary">Marginal Margin — Forces Overtime</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-accent-red">
            {formatPercentPrecise(overtimeMarginalPct)}
          </p>
        </div>
      </div>

      <p className="mt-4 font-sans text-sm text-text-secondary">
        <span className="text-text-primary">{capacity.ordersInOvertimeSlots}</span> of next week's{' '}
        <span className="text-text-primary">{capacity.ordersNextWeek}</span> orders fall into overtime slots.
      </p>

      <p className="mt-3 font-sans text-xs text-text-tertiary">
        Marginal view assumes fixed costs are absorbed by retail volume. Holds while utilisation stays low.
      </p>
    </section>
  );
}
