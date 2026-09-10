import { LABOUR_CONFIG } from '../../../config/labourConfig';
import type { LabourResult } from '../../../lib/labourCalc';
import { formatMinutes } from '../../../lib/format';

interface TimeAllocationBarProps {
  result: LabourResult;
}

interface Segment {
  label: string;
  minutes: number;
  colorClass: string;
}

/**
 * Stacked Productive / Changeover / Downtime / Break / Idle visual — shows why
 * an efficiency figure moved, not just that it moved (§11). Breaks only appear
 * as their own segment when unpaid — when paid, that time is absorbed into
 * "available" already and isn't a separate deduction (same convention the
 * deduction table uses).
 */
export function TimeAllocationBar({ result }: TimeAllocationBarProps) {
  const segments: Segment[] = [
    { label: 'Productive', minutes: result.productiveMinutes, colorClass: 'bg-accent-green' },
    { label: 'Idle / Other', minutes: Math.max(0, result.idleMinutes), colorClass: 'bg-accent-orange' },
    { label: 'Changeover', minutes: result.changeoverMinutes, colorClass: 'bg-accent-blue' },
    { label: 'Downtime', minutes: result.downtimeMinutes, colorClass: 'bg-accent-red' },
    ...(LABOUR_CONFIG.breaksArePaid ? [] : [{ label: 'Break', minutes: result.breakMinutes, colorClass: 'bg-text-secondary' }]),
  ];

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border-subtle">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={seg.colorClass}
            style={{ width: `${result.paidMinutes === 0 ? 0 : (seg.minutes / result.paidMinutes) * 100}%` }}
            title={`${seg.label}: ${formatMinutes(seg.minutes)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
            <span className={`h-2 w-2 rounded-full ${seg.colorClass}`} />
            {seg.label} ({formatMinutes(seg.minutes)})
          </div>
        ))}
      </div>
    </div>
  );
}
