import type { B2BClient } from '../../data';
import { computeConcentration } from '../../lib/b2bCalc';
import { formatPercentPrecise } from '../../lib/format';

interface ConcentrationRiskProps {
  clients: B2BClient[];
}

const SEGMENT_COLORS = ['bg-accent-blue', 'bg-accent-green', 'bg-accent-orange', 'bg-accent-red', 'bg-text-secondary'];

export function ConcentrationRisk({ clients }: ConcentrationRiskProps) {
  const result = computeConcentration(clients);

  if (result.topAccountName === null || result.topAccountPct === null) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">CONCENTRATION RISK</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Client concentration</h2>
      <p className="mt-1 font-mono text-sm text-text-secondary">
        Top-2 accounts are <span className="text-text-primary">{formatPercentPrecise(result.topTwoPct)}</span> of B2B
        revenue.
      </p>

      <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full border border-border-subtle">
        {result.segments.map((seg, i) => (
          <div
            key={seg.name}
            className={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
            style={{ width: `${seg.pct}%` }}
            title={`${seg.name}: ${formatPercentPrecise(seg.pct)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {result.segments.map((seg, i) => (
          <div key={seg.name} className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
            <span className={`h-2 w-2 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`} />
            {seg.name} ({formatPercentPrecise(seg.pct)})
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg border border-accent-red/30 bg-accent-red/10 px-3.5 py-2.5 text-sm text-text-primary">
        Losing {result.topAccountName} would cut B2B revenue by nearly {formatPercentPrecise(result.topAccountPct)}.
      </p>
    </section>
  );
}
