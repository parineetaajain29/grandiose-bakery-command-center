import { useMemo } from 'react';
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { bubbleRadius, formatSkuAed, formatSkuUnits, type Sku } from '../../lib/skuCalc';
import { SKU_DIVISION_COLORS, type Division } from '../../data/skuData';

interface SkuBubbleChartProps {
  divisions: Division[];
  products: Sku[];
  selectedSku: string | null;
  onSelect: (sku: string) => void;
}

interface BubblePoint extends Sku {
  x: number;
  y: number;
  r: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.5° — the same sunflower-spiral constant the source's own layout is conceptually built on.
const DIVISION_SLOT_WIDTH = 100;
const SPACING = 3.4;

/**
 * Not a line-for-line port of app.py's phyllotaxis relaxation algorithm
 * (bubble_layout, lines 1870-1935) — that's a rendering detail, not a
 * calculation, and Recharts has no built-in equivalent to adapt it into.
 * Same visual result instead: one cluster per division, biggest bubbles
 * closest to the cluster center, spiral-packed so bubbles rarely overlap.
 * X/Y here carry no literal meaning (matches the source: Plotly axes are
 * hidden there too) — they're just packed coordinates.
 */
function layoutBubbles(divisions: Division[], products: Sku[]): BubblePoint[] {
  const maxUnits = Math.max(...products.map((p) => p.units), 1);
  const points: BubblePoint[] = [];

  divisions.forEach((division, divIndex) => {
    const centerX = divIndex * DIVISION_SLOT_WIDTH;
    const divisionSkus = [...products.filter((p) => p.division === division)].sort((a, b) => b.units - a.units);
    divisionSkus.forEach((sku, i) => {
      const radius = SPACING * Math.sqrt(i);
      const theta = i * GOLDEN_ANGLE;
      points.push({
        ...sku,
        x: centerX + radius * Math.cos(theta),
        y: radius * Math.sin(theta),
        r: bubbleRadius(sku.units, maxUnits),
      });
    });
  });

  return points;
}

function BubbleTooltip({ active, payload }: { active?: boolean; payload?: { payload: BubblePoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel p-3 font-sans text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
      <p className="font-semibold text-text-primary">{p.product}</p>
      <p className="mt-1 text-text-secondary">{p.division}</p>
      <p className="mt-1 text-text-secondary">
        Units sold: <span className="text-text-primary">{formatSkuUnits(p.units)}</span>
      </p>
      <p className="text-text-secondary">
        Sales: <span className="text-text-primary">{formatSkuAed(p.salesAed)}</span>
      </p>
      <p className="text-text-secondary">
        Contribution: <span className="text-text-primary">{p.contributionPct}%</span> · Rank #{p.rank}
      </p>
      {p.collection && (
        <p className="mt-1 text-text-secondary">
          {p.collection} · {p.availability}
        </p>
      )}
    </div>
  );
}

export function SkuBubbleChart({ divisions, products, selectedSku, onSelect }: SkuBubbleChartProps) {
  const points = useMemo(() => layoutBubbles(divisions, products), [divisions, products]);
  const byDivision = useMemo(() => {
    const map = new Map<Division, BubblePoint[]>();
    for (const d of divisions) map.set(d, []);
    for (const p of points) map.get(p.division)?.push(p);
    return map;
  }, [divisions, points]);

  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 16, left: 16, bottom: 16 }}>
          <XAxis type="number" dataKey="x" hide domain={['dataMin - 10', 'dataMax + 10']} />
          <YAxis type="number" dataKey="y" hide domain={['dataMin - 10', 'dataMax + 10']} />
          <Tooltip content={<BubbleTooltip />} cursor={false} />
          {divisions.map((division) => (
            <Scatter
              key={division}
              name={division}
              data={byDivision.get(division) ?? []}
              fill={SKU_DIVISION_COLORS[division]}
              shape={(props: unknown) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: BubblePoint };
                const isSelected = payload.sku === selectedSku;
                return (
                  <g style={{ cursor: 'pointer' }} onClick={() => onSelect(payload.sku)}>
                    {isSelected && <circle cx={cx} cy={cy} r={payload.r + 4} fill="none" stroke="var(--text-primary)" strokeWidth={2} />}
                    <circle cx={cx} cy={cy} r={payload.r} fill={SKU_DIVISION_COLORS[payload.division]} fillOpacity={isSelected ? 0.95 : 0.75} stroke="var(--bg-panel)" strokeWidth={1} />
                  </g>
                );
              }}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
