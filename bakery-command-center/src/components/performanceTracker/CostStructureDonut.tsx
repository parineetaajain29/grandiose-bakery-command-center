import { useRef } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { costStructureRemainder } from '../../lib/performanceCalc';
import type { CostStructureBaseline } from '../../data/types';
import { formatPercent } from '../../lib/format';
import { ChartExportButton } from '../shared/ChartExportButton';

interface CostStructureDonutProps {
  costStructure: CostStructureBaseline;
  grossMarginPct: number;
  targetFoodCostPct: number;
  /** The parent's own section title ("Where revenue goes") — this component
   * has no header of its own, so the export button needs it passed in. */
  title: string;
}

const COLORS = ['var(--accent-blue)', 'var(--accent-orange)', 'var(--text-secondary)', 'var(--accent-red)', 'var(--accent-green)'];

/**
 * Streamlit cost_labels/cost_values (app.py lines 2104-2107). The center label
 * (grossMarginPct) is an independently-sourced figure, not the "Margin & other"
 * slice total below it — both numbers are reproduced exactly as the source
 * shows them. Confirmed via the product-flow audit (2026-09) as a genuine
 * different-basis calculation (target labour% vs. actual costs throughout),
 * not a bug — the gap is now labeled on-page instead of left unexplained.
 */
export function CostStructureDonut({ costStructure, grossMarginPct, targetFoodCostPct, title }: CostStructureDonutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const marginAndOther = costStructureRemainder(costStructure);
  const rows = [
    { name: 'Food cost', value: costStructure.foodCostPct },
    { name: 'Labour (target)', value: costStructure.labourTargetPct },
    { name: 'Packaging', value: costStructure.packagingPct },
    { name: 'Overhead', value: costStructure.overheadPct },
    { name: 'Margin & other', value: marginAndOther },
  ];

  // Data-derived interpretation — genuinely computed (not hardcoded to food
  // cost always winning): the largest of the four real cost lines, excluding
  // "Margin & other" since that's the residual, not a cost. Only food cost
  // has a defined target in this dataset, so the vs.-target framing only
  // applies when it happens to be the largest line.
  const costLines = rows.slice(0, 4);
  const largestCostLine = costLines.reduce((a, b) => (b.value > a.value ? b : a));
  const foodCostGap = costStructure.foodCostPct - targetFoodCostPct;

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="flex w-full justify-end">
        <ChartExportButton
          containerRef={containerRef}
          title={title}
          legend={rows.map((row, i) => ({ label: `${row.name} · ${formatPercent(row.value)}`, color: COLORS[i % COLORS.length] }))}
          sourceLabel="Illustrative / Demo"
        />
      </div>
      <div className="relative h-64 w-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={1} startAngle={90} endAngle={-270} isAnimationActive={false}>
              {rows.map((row, i) => (
                <Cell key={row.name} fill={COLORS[i % COLORS.length]} stroke="var(--bg-panel)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 12 }}
              formatter={(value, name) => [formatPercent(Number(value)), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-sans font-tabular text-2xl font-semibold text-text-primary">{formatPercent(grossMarginPct)}</p>
          <p className="font-sans text-xs text-text-tertiary">margin</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map((row, i) => (
          <div key={row.name} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="font-sans text-xs text-text-secondary">
              {row.name} · {formatPercent(row.value)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-xs text-center font-sans text-xs text-text-tertiary">
        "Margin &amp; other" is a residual — actual food cost subtracted from 100%, alongside{' '}
        <em>target</em> labour, packaging, and overhead. It is a different calculation from the{' '}
        {formatPercent(grossMarginPct)} gross margin shown above, which reflects actual costs throughout — the two
        are not expected to match.
      </p>
      <p className="mt-3 max-w-xs text-center font-sans text-xs text-text-secondary">
        <strong className="text-text-primary">{largestCostLine.name}</strong> is the largest line in the cost
        structure at {formatPercent(largestCostLine.value)} of revenue
        {largestCostLine.name === 'Food cost' &&
          ` — ${foodCostGap.toFixed(1)}pt above the ${formatPercent(targetFoodCostPct)} target`}
        .
      </p>
    </div>
  );
}
