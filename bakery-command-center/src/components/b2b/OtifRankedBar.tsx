import { useRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { B2BClient } from '../../data';
import { formatPercentPrecise } from '../../lib/format';
import { ChartExportButton } from '../shared/ChartExportButton';

interface OtifRankedBarProps {
  clients: B2BClient[];
}

const TONE_FILL: Record<'green' | 'red', string> = {
  green: 'var(--accent-green)',
  red: 'var(--accent-red)',
};

interface Row {
  name: string;
  value: number;
  lateCount: number;
  tone: 'green' | 'red';
}

function OtifTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel p-3 font-sans text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
      <p className="font-semibold text-text-primary">{row.name}</p>
      <p className="mt-1 text-text-secondary">
        OTIF: <span className="text-text-primary">{formatPercentPrecise(row.value)}</span>
      </p>
      {row.lateCount > 0 && (
        <p className="text-text-secondary">
          {row.lateCount} late {row.lateCount === 1 ? 'delivery' : 'deliveries'}
        </p>
      )}
    </div>
  );
}

/**
 * OTIF % per client, ranked. AccountTable already lists OTIF % per client
 * (sortable by clicking the column), but a table needs a click to reorder
 * and shows no visual magnitude — this bar makes the gap between accounts
 * visible at a glance. Colored by whether the client had any late delivery
 * at all (onTimeCount < totalDeliveries — a real per-client fact), not an
 * invented percentage cutoff.
 */
export function OtifRankedBar({ clients }: OtifRankedBarProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartRows: Row[] = [...clients]
    .map((c) => ({
      name: c.name,
      value: c.otifPct,
      lateCount: c.totalDeliveries - c.onTimeCount,
      tone: c.onTimeCount < c.totalDeliveries ? ('red' as const) : ('green' as const),
    }))
    .sort((a, b) => a.value - b.value);

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-medium text-text-tertiary">Service Performance</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">OTIF by client</h2>
        </div>
        <ChartExportButton containerRef={chartRef} title="OTIF by Client" sourceLabel="Illustrative / Demo" />
      </div>
      <p className="mt-1 max-w-2xl font-sans text-xs text-text-tertiary">
        On-time-in-full rate per client, ranked. Red = at least one late delivery this period.
      </p>

      <div ref={chartRef} className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<OtifTooltip />} cursor={{ fill: 'var(--border-subtle)', opacity: 0.3 }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {chartRows.map((row) => (
                <Cell key={row.name} fill={TONE_FILL[row.tone]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
