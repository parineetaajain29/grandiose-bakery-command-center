import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { B2BClient } from '../../data';

interface DeliveryVolumeShareProps {
  clients: B2BClient[];
}

const COLORS = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-orange)', 'var(--accent-red)', 'var(--text-secondary)'];

interface ShareRow {
  name: string;
  deliveries: number;
  sharePct: number;
}

function ShareTooltip({ active, payload }: { active?: boolean; payload?: { payload: ShareRow }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-card border border-border-subtle bg-bg-panel p-3 font-sans text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
      <p className="font-semibold text-text-primary">{row.name}</p>
      <p className="mt-1 text-text-secondary">
        {row.deliveries} deliveries ({row.sharePct.toFixed(1)}% of total)
      </p>
    </div>
  );
}

/**
 * Real per-client totalDeliveries, summed and expressed as a share of the
 * total — deliveries actually recorded this period, not a contracted
 * delivery commitment. No such commitment field exists anywhere in the real
 * B2B data (confirmed by direct inspection of B2BClient and a repo-wide
 * search, not assumed), so this uses the genuine delivery-count proxy and
 * says so on-page rather than implying a contractual figure.
 */
export function DeliveryVolumeShare({ clients }: DeliveryVolumeShareProps) {
  const totalDeliveries = clients.reduce((sum, c) => sum + c.totalDeliveries, 0);
  const rows: ShareRow[] = [...clients]
    .sort((a, b) => b.totalDeliveries - a.totalDeliveries)
    .map((c) => ({
      name: c.name,
      deliveries: c.totalDeliveries,
      sharePct: totalDeliveries === 0 ? 0 : (c.totalDeliveries / totalDeliveries) * 100,
    }));

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Delivery Volume</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Delivery Volume Share by Client</h2>
      <p className="mt-1 max-w-2xl font-sans text-xs text-text-tertiary">
        Based on total deliveries recorded per client — not a contracted delivery commitment.
      </p>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="h-64 w-64 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="deliveries" nameKey="name" innerRadius={55} outerRadius={100} paddingAngle={1} isAnimationActive={false}>
                {rows.map((row, i) => (
                  <Cell key={row.name} fill={COLORS[i % COLORS.length]} stroke="var(--bg-panel)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<ShareTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {rows.map((row, i) => (
            <div key={row.name} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="font-sans text-xs text-text-secondary">
                {row.name} · {row.deliveries} deliveries · {row.sharePct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
