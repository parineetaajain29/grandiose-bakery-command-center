import { useMemo, useState } from 'react';
import { scenariosFile } from '../data';

const { supplierRisk } = scenariosFile;

type SortMode = 'leadTime' | 'spend' | 'az';

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'leadTime', label: 'Lead time' },
  { key: 'spend', label: 'Spend' },
  { key: 'az', label: 'A–Z' },
];

const RISK_CLASS: Record<string, string> = {
  Low: 'bg-accent-green/15 text-accent-green border-accent-green/40',
  Watch: 'bg-accent-orange/15 text-accent-orange border-accent-orange/40',
  High: 'bg-accent-red/15 text-accent-red border-accent-red/40',
};

const CATEGORY_COLOR: Record<string, string> = {
  'dual-sourced': 'var(--accent-green)',
  'single-sourced': 'var(--accent-red)',
  mixed: 'var(--accent-orange)',
};

export function SupplierRiskTable() {
  const [sortMode, setSortMode] = useState<SortMode>('leadTime');
  const [singleSourcedOnly, setSingleSourcedOnly] = useState(false);

  const rows = useMemo(() => {
    let list = supplierRisk.suppliers;
    if (singleSourcedOnly) list = list.filter((s) => s.sourcing === 'Single-sourced');

    const sorted = [...list];
    if (sortMode === 'leadTime') sorted.sort((a, b) => b.leadTimeDays - a.leadTimeDays);
    if (sortMode === 'spend') sorted.sort((a, b) => b.spendAED - a.spendAED);
    if (sortMode === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [sortMode, singleSourcedOnly]);

  const categoryTotal = supplierRisk.categoryBar.reduce((a, b) => a + b.value, 0);

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">PROCUREMENT</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">
        Supplier &amp; procurement risk
      </h2>
      <p className="mt-1 font-mono text-sm text-text-secondary">
        ~{supplierRisk.summary.vendorCount} approved vendors · {supplierRisk.summary.onNinetyDayTerms}% on 90-day
        payment terms · {supplierRisk.summary.safetyStockMonths}-month safety stock maintained
      </p>

      <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full border border-border-subtle">
        {supplierRisk.categoryBar.map((c) => (
          <div
            key={c.category}
            style={{ width: `${(c.value / categoryTotal) * 100}%`, backgroundColor: CATEGORY_COLOR[c.status] ?? 'var(--text-secondary)' }}
            title={`${c.category}: ${c.value} vendors (${c.status})`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {supplierRisk.categoryBar.map((c) => (
          <div key={c.category} className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[c.status] ?? 'var(--text-secondary)' }} />
            {c.category} ({c.value})
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
        <button
          type="button"
          onClick={() => setSingleSourcedOnly((v) => !v)}
          aria-pressed={singleSourcedOnly}
          className={`rounded-full border px-3.5 py-1.5 font-mono text-xs tracking-wide transition-colors ${
            singleSourcedOnly
              ? 'border-accent-red bg-accent-red/15 text-accent-red'
              : 'border-border-subtle text-text-secondary hover:text-text-primary'
          }`}
        >
          Single-sourced only
        </button>

        <div className="flex gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortMode(opt.key)}
              className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                sortMode === opt.key
                  ? 'border-accent-blue text-accent-blue'
                  : 'border-border-subtle text-text-secondary hover:text-text-primary'
              }`}
            >
              Sort: {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-mono text-[11px] tracking-wide text-text-secondary">
              <th className="py-2 pr-4 font-normal">Supplier</th>
              <th className="py-2 pr-4 font-normal">Category</th>
              <th className="py-2 pr-4 font-normal">Dependency</th>
              <th className="py-2 pr-4 font-normal">Lead time</th>
              <th className="py-2 pr-4 font-normal">Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name} className="border-b border-border-subtle/60 text-sm last:border-0">
                <td className="py-2.5 pr-4 font-mono text-text-primary">{s.name}</td>
                <td className="py-2.5 pr-4 font-mono text-text-secondary">{s.category}</td>
                <td className="py-2.5 pr-4 font-mono text-text-secondary">{s.sourcing}</td>
                <td className="py-2.5 pr-4 font-mono font-tabular text-text-secondary">{s.leadTimeDays}d</td>
                <td className="py-2.5 pr-4">
                  <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${RISK_CLASS[s.risk]}`}>
                    {s.risk}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center font-mono text-xs text-text-secondary">
                  No suppliers match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
