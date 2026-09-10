import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WastageByDivisionRow } from '../../data/types';
import { scenariosFile } from '../../data';
import { formatPercent } from '../../lib/format';
import { DataSourceBadge } from '../shared/DataSourceBadge';

interface WastageByDivisionProps {
  rows: WastageByDivisionRow[];
}

const TARGET = scenariosFile.meta.wastageTarget;

/**
 * New for this migration — no equivalent exists in the Streamlit Performance
 * Tracker (confirmed via full-file grep: no per-division wastage breakdown
 * anywhere in app.py). Built as an explicit strengthening per the migration
 * brief, using the same six product divisions as SKU Performance. Illustrative
 * data, disclosed as such — not a Streamlit-sourced figure.
 */
export function WastageByDivision({ rows }: WastageByDivisionProps) {
  const worst = rows.reduce((a, b) => (b.wastagePct > a.wastagePct ? b : a), rows[0]);
  const sorted = [...rows].sort((a, b) => b.wastagePct - a.wastagePct);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">WASTAGE BY DIVISION</p>
          <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Which division drives the wastage figure</h3>
        </div>
        <DataSourceBadge source="illustrative" />
      </div>
      <p className="mt-1 max-w-2xl font-mono text-sm text-text-secondary">
        Not part of the original Performance Tracker — added to show which of the six product divisions contributes
        most to the company-wide wastage %. <strong className="text-text-primary">{worst.division}</strong> is the
        largest contributor at {formatPercent(worst.wastagePct)}, against the {formatPercent(TARGET)} target.
      </p>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
            <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="division" width={140} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
              formatter={(value) => [formatPercent(Number(value)), 'Wastage %']}
            />
            <ReferenceLine x={TARGET} stroke="var(--accent-green)" strokeDasharray="4 4" label={{ value: `${TARGET}% target`, position: 'top', fill: 'var(--accent-green)', fontSize: 10 }} />
            <Bar dataKey="wastagePct" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {sorted.map((row) => (
                <Cell key={row.division} fill={row.division === worst.division ? 'var(--accent-red)' : 'var(--accent-orange)'} fillOpacity={row.division === worst.division ? 0.85 : 0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
