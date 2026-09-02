import { useMemo, useState } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import type { SankeyData } from '../data';
import { formatAED, formatPercent } from '../lib/format';

interface SankeyMoneyFlowProps {
  sankeyData: SankeyData;
  isDerived: boolean;
}

interface RawNode {
  id: string;
  label: string;
  color: string;
  align: 'start' | 'middle' | 'end';
}

interface RawLink {
  id: string;
  source: string;
  target: string;
  value: number;
  color: string;
}

const BLUE = 'var(--accent-blue)';
const ORANGE = 'var(--accent-orange)';
const RED = 'var(--accent-red)';
const GREEN = 'var(--accent-green)';

const WIDTH = 1180;
const HEIGHT = 860;

function buildGraph(data: SankeyData) {
  const nodes: RawNode[] = [];
  const links: RawLink[] = [];

  data.revenue.forEach((d) => {
    nodes.push({ id: `rev-${d.name}`, label: d.name, color: BLUE, align: 'start' });
    links.push({ id: `l-rev-${d.name}`, source: `rev-${d.name}`, target: 'total-revenue', value: d.value, color: BLUE });
  });

  nodes.push({ id: 'total-revenue', label: 'Total Bakery Revenue', color: BLUE, align: 'middle' });

  const copTotal = data.costOfProduction.reduce((a, b) => a + b.value, 0);
  const revenueTotal = data.revenue.reduce((a, b) => a + b.value, 0);
  const grossProfit = revenueTotal - copTotal;
  const opexTotal = data.opex.reduce((a, b) => a + b.value, 0);
  const operatingResult = grossProfit - opexTotal;

  nodes.push({ id: 'cost-of-production', label: 'Cost of Production', color: ORANGE, align: 'middle' });
  nodes.push({ id: 'gross-profit', label: 'Gross Profit', color: BLUE, align: 'middle' });

  links.push({ id: 'l-cop', source: 'total-revenue', target: 'cost-of-production', value: copTotal, color: ORANGE });
  links.push({ id: 'l-gp', source: 'total-revenue', target: 'gross-profit', value: grossProfit, color: BLUE });

  data.costOfProduction.forEach((d) => {
    nodes.push({ id: `cop-${d.name}`, label: d.name, color: ORANGE, align: 'end' });
    links.push({ id: `l-cop-${d.name}`, source: 'cost-of-production', target: `cop-${d.name}`, value: d.value, color: ORANGE });
  });

  data.opex.forEach((d) => {
    const isWastage = d.name === 'Wastage';
    nodes.push({ id: `opex-${d.name}`, label: d.name, color: isWastage ? RED : ORANGE, align: 'end' });
    links.push({
      id: `l-opex-${d.name}`,
      source: 'gross-profit',
      target: `opex-${d.name}`,
      value: d.value,
      color: isWastage ? RED : ORANGE,
    });
  });

  nodes.push({ id: 'operating-result', label: 'Operating Result', color: GREEN, align: 'end' });
  links.push({ id: 'l-opres', source: 'gross-profit', target: 'operating-result', value: Math.max(operatingResult, 0), color: GREEN });

  return { nodes, links, revenueTotal, copTotal, grossProfit, opexTotal, operatingResult };
}

/** Ancestors (incl. self) walking backward, descendants (incl. self) walking forward. */
function buildAdjacency(links: RawLink[]) {
  const outgoing = new Map<string, RawLink[]>();
  const incoming = new Map<string, RawLink[]>();
  links.forEach((l) => {
    if (!outgoing.has(l.source)) outgoing.set(l.source, []);
    if (!incoming.has(l.target)) incoming.set(l.target, []);
    outgoing.get(l.source)!.push(l);
    incoming.get(l.target)!.push(l);
  });
  return { outgoing, incoming };
}

function collectPath(
  startNodeId: string,
  outgoing: Map<string, RawLink[]>,
  incoming: Map<string, RawLink[]>,
): { nodeIds: Set<string>; linkIds: Set<string> } {
  const nodeIds = new Set<string>([startNodeId]);
  const linkIds = new Set<string>();

  const stack = [startNodeId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const l of incoming.get(id) ?? []) {
      linkIds.add(l.id);
      if (!nodeIds.has(l.source)) {
        nodeIds.add(l.source);
        stack.push(l.source);
      }
    }
  }

  const stack2 = [startNodeId];
  while (stack2.length) {
    const id = stack2.pop()!;
    for (const l of outgoing.get(id) ?? []) {
      linkIds.add(l.id);
      if (!nodeIds.has(l.target)) {
        nodeIds.add(l.target);
        stack2.push(l.target);
      }
    }
  }

  return { nodeIds, linkIds };
}

export function SankeyMoneyFlow({ sankeyData, isDerived }: SankeyMoneyFlowProps) {
  const [hovered, setHovered] = useState<{ nodeIds: Set<string>; linkIds: Set<string> } | null>(null);

  const { graph, revenueTotal, copTotal, grossProfit, opexTotal, operatingResult, outgoing, incoming } = useMemo(() => {
    const built = buildGraph(sankeyData);
    const { outgoing, incoming } = buildAdjacency(built.links);

    const sankeyGenerator = sankey<RawNode, RawLink>()
      .nodeId((d) => d.id)
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [1, 40],
        [WIDTH - 1, HEIGHT - 16],
      ]);

    const graph = sankeyGenerator({
      nodes: built.nodes.map((d) => ({ ...d })),
      links: built.links.map((d) => ({ ...d })),
    } as never) as unknown as {
      nodes: (RawNode & { x0: number; x1: number; y0: number; y1: number; value: number })[];
      links: (RawLink & { source: RawNode & { x1: number }; target: RawNode & { x0: number }; width: number })[];
    };

    return {
      graph,
      revenueTotal: built.revenueTotal,
      copTotal: built.copTotal,
      grossProfit: built.grossProfit,
      opexTotal: built.opexTotal,
      operatingResult: built.operatingResult,
      outgoing,
      incoming,
    };
  }, [sankeyData]);

  const operatingMarginPct = (operatingResult / revenueTotal) * 100;
  const linkPath = sankeyLinkHorizontal();

  const isDimmed = (kind: 'node' | 'link', id: string) => {
    if (!hovered) return false;
    return kind === 'node' ? !hovered.nodeIds.has(id) : !hovered.linkIds.has(id);
  };

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">MONEY FLOW</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">
            Where every dirham went
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-secondary">
            Hover any source, node, or ribbon to trace its full path end-to-end.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">OPERATING MARGIN</p>
          <p className="mt-1 font-sans font-tabular text-2xl font-semibold text-accent-green">
            {formatPercent(operatingMarginPct)}
          </p>
        </div>
      </div>

      {isDerived && (
        <p className="mt-3 font-mono text-[11px] text-text-secondary">
          Modeled from Jul actuals mix, scaled to this scenario/period's totals — not independently reported.
        </p>
      )}

      <div className="mt-4 w-full overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[880px]" role="img" aria-label="Bakery money flow diagram">
          <g>
            {graph.links.map((link) => {
              const dimmed = isDimmed('link', link.id);
              return (
                <path
                  key={link.id}
                  d={linkPath(link as never) ?? undefined}
                  fill="none"
                  stroke={link.color}
                  strokeWidth={Math.max(1, link.width)}
                  strokeOpacity={dimmed ? 0.08 : 0.35}
                  onMouseEnter={() =>
                    setHovered({
                      nodeIds: new Set([link.source.id, link.target.id, ...collectPath(link.source.id, outgoing, incoming).nodeIds, ...collectPath(link.target.id, outgoing, incoming).nodeIds]),
                      linkIds: new Set([
                        link.id,
                        ...collectPath(link.source.id, outgoing, incoming).linkIds,
                        ...collectPath(link.target.id, outgoing, incoming).linkIds,
                      ]),
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer transition-opacity duration-150"
                />
              );
            })}
          </g>

          <g>
            {graph.nodes.map((node) => {
              const dimmed = isDimmed('node', node.id);
              const x = node.x0;
              const y = node.y0;
              const w = node.x1 - node.x0;
              const h = Math.max(2, node.y1 - node.y0);
              const labelOnLeft = node.align === 'end';
              const labelCentered = node.align === 'middle';

              return (
                <g
                  key={node.id}
                  onMouseEnter={() => setHovered(collectPath(node.id, outgoing, incoming))}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={node.color}
                    opacity={dimmed ? 0.25 : 1}
                    rx={2}
                    className="transition-opacity duration-150"
                  />
                  {labelCentered ? (
                    <>
                      <text
                        x={x + w / 2}
                        y={y - 16}
                        textAnchor="middle"
                        className="font-mono text-[11px]"
                        fill="var(--text-primary)"
                        opacity={dimmed ? 0.3 : 1}
                      >
                        {node.label}
                      </text>
                      <text
                        x={x + w / 2}
                        y={y - 4}
                        textAnchor="middle"
                        className="font-mono text-[10px] font-tabular"
                        fill="var(--text-secondary)"
                        opacity={dimmed ? 0.3 : 1}
                      >
                        {formatAED(node.value, { compact: true })}
                      </text>
                    </>
                  ) : (
                    <text
                      x={labelOnLeft ? x - 8 : x + w + 8}
                      y={y + h / 2 + 3.5}
                      textAnchor={labelOnLeft ? 'end' : 'start'}
                      className="font-mono text-[10.5px]"
                      fill="var(--text-primary)"
                      opacity={dimmed ? 0.3 : 1}
                    >
                      {node.label}
                      <tspan fill="var(--text-secondary)" className="font-tabular">
                        {'  '}
                        {formatAED(node.value, { compact: true })}
                      </tspan>
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border-subtle pt-5 sm:grid-cols-5">
        {[
          { label: 'Total Revenue', value: revenueTotal, color: 'text-text-primary' },
          { label: 'Cost of Production', value: copTotal, color: 'text-accent-orange' },
          { label: 'Gross Profit', value: grossProfit, color: 'text-accent-blue' },
          { label: 'Operating Expense', value: opexTotal, color: 'text-accent-orange' },
          { label: 'Operating Result', value: operatingResult, color: 'text-accent-green' },
        ].map((s) => (
          <div key={s.label}>
            <p className="font-mono text-[10px] tracking-wide text-text-secondary">{s.label.toUpperCase()}</p>
            <p className={`mt-1 font-sans font-tabular text-lg font-semibold ${s.color}`}>
              {formatAED(s.value, { compact: true })}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
