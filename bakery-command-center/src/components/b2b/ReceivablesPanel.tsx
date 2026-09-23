import type { B2BReceivables } from '../../data';
import { computePastDuePct } from '../../lib/b2bCalc';
import { formatCurrencyPrecise, formatPercentPrecise } from '../../lib/format';

interface ReceivablesPanelProps {
  receivables: B2BReceivables;
}

// Exported so B2BPage.tsx's shared export can label the aging buckets with
// the exact same text shown here — one source of truth for the labels.
export const BUCKET_LABELS = ['0–30 days', '31–60 days', '61–90 days', '90+ days'];
const BUCKET_COLORS = ['bg-accent-green', 'bg-accent-blue', 'bg-accent-orange', 'bg-accent-red'];

// This panel's own bespoke "Export statement" button (hand-rolled CSV +
// blob-download, predating the shared export utility) has been removed in
// favour of B2BPage.tsx's ExportMenu — one export mechanism for the whole
// page instead of a second, page-local one just for this panel.
export function ReceivablesPanel({ receivables }: ReceivablesPanelProps) {
  const total = receivables.buckets.reduce((a, b) => a + b, 0);
  const pastDuePct = computePastDuePct(receivables.total, receivables.past60);

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <div>
        <p className="font-sans text-xs font-medium text-text-tertiary">Receivables</p>
        <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">B2B receivables</h2>
      </div>

      <div className="mt-5 grid gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle sm:grid-cols-2">
        <div className="bg-bg-panel p-4">
          <p className="font-sans text-xs font-medium text-text-tertiary">Total Outstanding</p>
          <p className="mt-1.5 font-sans font-tabular text-2xl font-semibold text-text-primary">
            {formatCurrencyPrecise(receivables.total)}
          </p>
        </div>
        <div className="bg-bg-panel p-4">
          <p className="font-sans text-xs font-medium text-text-tertiary">Past 60 Days</p>
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
          <div key={BUCKET_LABELS[i]} className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
            <span className={`h-2 w-2 rounded-full ${BUCKET_COLORS[i]}`} />
            {BUCKET_LABELS[i]} ({formatCurrencyPrecise(v)})
          </div>
        ))}
      </div>
    </section>
  );
}
