import type { B2BClient, B2BReceivables } from '../../data';
import { computePastDuePct } from '../../lib/b2bCalc';
import { formatCurrencyPrecise, formatPercentPrecise } from '../../lib/format';

interface ReceivablesPanelProps {
  receivables: B2BReceivables;
  clients: B2BClient[];
}

const BUCKET_LABELS = ['0–30 days', '31–60 days', '61–90 days', '90+ days'];
const BUCKET_COLORS = ['bg-accent-green', 'bg-accent-blue', 'bg-accent-orange', 'bg-accent-red'];

function toCsv(clients: B2BClient[]): string {
  const header = ['Client', 'Location', 'Frequency', 'Revenue', 'Service Cost', 'Margin %', 'Marginal Margin %', 'OTIF %', 'Payment Terms (days)'];
  const rows = clients.map((c) => [
    c.name,
    c.location,
    c.frequency,
    c.revenue.toFixed(2),
    c.serviceCost.toFixed(2),
    c.marginPct.toFixed(1),
    c.marginalMarginPct.toFixed(1),
    c.otifPct.toFixed(1),
    String(c.paymentTermsDays),
  ]);
  return [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReceivablesPanel({ receivables, clients }: ReceivablesPanelProps) {
  const total = receivables.buckets.reduce((a, b) => a + b, 0);
  const pastDuePct = computePastDuePct(receivables.total, receivables.past60);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">RECEIVABLES</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">B2B receivables</h2>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(toCsv(clients), 'b2b-account-statement.csv')}
          className="rounded-full border border-border-subtle bg-bg-panel px-4 py-2 font-mono text-xs tracking-wide text-text-secondary transition-colors hover:border-accent-blue/60 hover:text-text-primary"
        >
          Export statement
        </button>
      </div>

      <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-2">
        <div className="bg-bg-panel p-4">
          <p className="font-mono text-[10px] tracking-wide text-text-secondary">TOTAL OUTSTANDING</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-text-primary">
            {formatCurrencyPrecise(receivables.total)}
          </p>
        </div>
        <div className="bg-bg-panel p-4">
          <p className="font-mono text-[10px] tracking-wide text-text-secondary">PAST 60 DAYS</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-accent-red">
            {formatCurrencyPrecise(receivables.past60)}
            {pastDuePct !== null && <span className="ml-2 text-sm text-text-secondary">({formatPercentPrecise(pastDuePct)})</span>}
          </p>
        </div>
      </div>

      <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full border border-border-subtle">
        {receivables.buckets.map((v, i) => (
          <div
            key={BUCKET_LABELS[i]}
            className={BUCKET_COLORS[i]}
            style={{ width: `${(v / total) * 100}%` }}
            title={`${BUCKET_LABELS[i]}: ${formatCurrencyPrecise(v)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {receivables.buckets.map((v, i) => (
          <div key={BUCKET_LABELS[i]} className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
            <span className={`h-2 w-2 rounded-full ${BUCKET_COLORS[i]}`} />
            {BUCKET_LABELS[i]} ({formatCurrencyPrecise(v)})
          </div>
        ))}
      </div>
    </section>
  );
}
