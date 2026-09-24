import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { B2BClient } from '../../data';
import { formatAED, formatCurrencyPrecise } from '../../lib/format';

interface ReceivablesByClientProps {
  clients: B2BClient[];
}

const TONE_FILL: Record<'green' | 'red', string> = {
  green: 'var(--accent-green)',
  red: 'var(--accent-red)',
};

interface Row {
  name: string;
  receivableAmount: number;
  daysOutstanding: number;
  paymentTermsDays: number;
  tone: 'green' | 'red';
}

function ReceivableTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel p-3 font-sans text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
      <p className="font-semibold text-text-primary">{row.name}</p>
      <p className="mt-1 text-text-secondary">
        Outstanding: <span className="text-text-primary">{formatCurrencyPrecise(row.receivableAmount)}</span>
      </p>
      <p className="text-text-secondary">
        {row.daysOutstanding} days outstanding vs. {row.paymentTermsDays}-day terms
      </p>
    </div>
  );
}

/**
 * Per-client receivables, ranked by amount outstanding. Different
 * granularity from ReceivablesPanel's company-wide aging-bucket bar (left
 * as-is below): that answers "how much sits in each age bucket overall,"
 * this answers "which specific account is the collections risk." Colored
 * red when that client's own daysOutstanding exceeds their own contracted
 * paymentTermsDays — both real per-client fields, no invented threshold.
 */
export function ReceivablesByClient({ clients }: ReceivablesByClientProps) {
  const chartRows: Row[] = [...clients]
    .map((c) => ({
      name: c.name,
      receivableAmount: c.receivableAmount,
      daysOutstanding: c.daysOutstanding,
      paymentTermsDays: c.paymentTermsDays,
      tone: c.daysOutstanding > c.paymentTermsDays ? ('red' as const) : ('green' as const),
    }))
    .sort((a, b) => b.receivableAmount - a.receivableAmount);

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Receivables</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Receivables by client</h2>
      <p className="mt-1 max-w-2xl font-sans text-xs text-text-tertiary">
        Amount outstanding per client, ranked. Red = that client is past their own contracted payment terms.
      </p>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
            <XAxis
              type="number"
              tickFormatter={(v) => formatAED(v, { compact: true }).replace('AED ', '')}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ReceivableTooltip />} cursor={{ fill: 'var(--border-subtle)', opacity: 0.3 }} />
            <Bar dataKey="receivableAmount" radius={[0, 4, 4, 0]} isAnimationActive={false}>
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
