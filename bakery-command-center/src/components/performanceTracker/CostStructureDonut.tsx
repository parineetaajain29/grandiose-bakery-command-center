import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { costStructureRemainder } from '../../lib/performanceCalc';
import type { CostStructureBaseline } from '../../data/types';
import { formatPercent } from '../../lib/format';

interface CostStructureDonutProps {
  costStructure: CostStructureBaseline;
  grossMarginPct: number;
}

const COLORS = ['var(--accent-blue)', 'var(--accent-orange)', 'var(--text-secondary)', 'var(--accent-red)', 'var(--accent-green)'];

/**
 * Streamlit cost_labels/cost_values (app.py lines 2104-2107). The center label
 * (grossMarginPct) is an independently-sourced figure, not the "Margin & other"
 * slice total below it — both numbers are reproduced exactly as the source
 * shows them, including that mismatch (see migration report).
 */
export function CostStructureDonut({ costStructure, grossMarginPct }: CostStructureDonutProps) {
  const marginAndOther = costStructureRemainder(costStructure);
  const rows = [
    { name: 'Food cost', value: costStructure.foodCostPct },
    { name: 'Labour (target)', value: costStructure.labourTargetPct },
    { name: 'Packaging', value: costStructure.packagingPct },
    { name: 'Overhead', value: costStructure.overheadPct },
    { name: 'Margin & other', value: marginAndOther },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-64 w-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={1} startAngle={90} endAngle={-270} isAnimationActive={false}>
              {rows.map((row, i) => (
                <Cell key={row.name} fill={COLORS[i % COLORS.length]} stroke="var(--bg-panel)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
              formatter={(value, name) => [formatPercent(Number(value)), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-sans font-tabular text-2xl font-semibold text-text-primary">{formatPercent(grossMarginPct)}</p>
          <p className="font-mono text-[10px] tracking-wide text-text-secondary">margin</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map((row, i) => (
          <div key={row.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="font-mono text-[11px] text-text-secondary">
              {row.name} · {formatPercent(row.value)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-xs text-center font-mono text-[11px] text-text-secondary">
        Illustrative allocation, blending current actuals with target labour cost.
      </p>
    </div>
  );
}
