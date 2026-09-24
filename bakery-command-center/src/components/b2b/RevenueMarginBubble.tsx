import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { B2BClient } from '../../data';
import { formatAED, formatCurrencyPrecise, formatPercentPrecise } from '../../lib/format';

interface RevenueMarginBubbleProps {
  clients: B2BClient[];
  retailMarginPct: number;
}

interface BubblePoint {
  name: string;
  revenue: number;
  marginPct: number;
  absMargin: number;
  r: number;
  tone: 'green' | 'amber' | 'red';
}

const TONE_FILL: Record<'green' | 'amber' | 'red', string> = {
  green: 'var(--accent-green)',
  amber: 'var(--accent-orange)',
  red: 'var(--accent-red)',
};

const R_MIN = 10;
const R_MAX = 32;

/** Compares each client's margin to the retail margin benchmark already
 * shown in this page's own KPI row — not an invented threshold. Negative
 * margin is always 'red' regardless of the benchmark. */
function marginTone(marginPct: number, benchmarkPct: number): 'green' | 'amber' | 'red' {
  if (marginPct < 0) return 'red';
  if (marginPct < benchmarkPct) return 'amber';
  return 'green';
}

function BubbleTooltip({ active, payload }: { active?: boolean; payload?: { payload: BubblePoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel p-3 font-sans text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
      <p className="font-semibold text-text-primary">{p.name}</p>
      <p className="mt-1 text-text-secondary">
        Revenue: <span className="text-text-primary">{formatCurrencyPrecise(p.revenue)}</span>
      </p>
      <p className="text-text-secondary">
        Net margin: <span className="text-text-primary">{formatPercentPrecise(p.marginPct)}</span>
      </p>
      <p className="text-text-secondary">
        Absolute margin: <span className="text-text-primary">{formatCurrencyPrecise(p.absMargin)}</span>
      </p>
    </div>
  );
}

/**
 * Revenue vs. net margin per client. Bubble size = absolute margin
 * contribution (revenue × marginPct / 100 — a unit conversion of two real
 * fields already on B2BClient, not a new calculation). This consolidates
 * two of the brief's candidate visuals ("Revenue vs Net Margin scatter" and
 * "margin contribution by client") into one chart rather than building both
 * separately. Not a duplicate of RevenueVsCostChart, which is a 13-week
 * aggregate revenue/cost trend, not a per-client cross-section.
 */
export function RevenueMarginBubble({ clients, retailMarginPct }: RevenueMarginBubbleProps) {
  const points = clients.map((c) => ({
    name: c.name,
    revenue: c.revenue,
    marginPct: c.marginPct,
    absMargin: (c.revenue * c.marginPct) / 100,
    tone: marginTone(c.marginPct, retailMarginPct),
  }));

  const maxAbsMargin = Math.max(...points.map((p) => Math.abs(p.absMargin)), 1);
  const scaled: BubblePoint[] = points.map((p) => ({
    ...p,
    r: R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.abs(p.absMargin) / maxAbsMargin),
  }));

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Account Profitability</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Revenue vs. net margin by client</h2>
      <p className="mt-1 max-w-2xl font-sans text-xs text-text-tertiary">
        Bubble size = absolute margin contribution. Color vs. the {formatPercentPrecise(retailMarginPct)} retail margin benchmark.
      </p>

      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
            <XAxis
              type="number"
              dataKey="revenue"
              name="Revenue"
              tickFormatter={(v) => formatAED(v, { compact: true }).replace('AED ', '')}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="marginPct"
              name="Net margin"
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<BubbleTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--border-subtle)' }} />
            <Scatter
              data={scaled}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: BubblePoint };
                return (
                  <circle cx={cx} cy={cy} r={payload.r} fill={TONE_FILL[payload.tone]} fillOpacity={0.75} stroke="var(--bg-panel)" strokeWidth={1} />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE_FILL.green }} /> At/above benchmark
        </div>
        <div className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE_FILL.amber }} /> Below benchmark
        </div>
        <div className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TONE_FILL.red }} /> Negative margin
        </div>
      </div>
    </section>
  );
}
