import { useMemo, useState } from 'react';
import { scenariosFile } from '../../data';
import { computeHhi } from '../../lib/scenarioCalc';
import { DataSourceBadge } from '../shared/DataSourceBadge';

const { supplierAlternatives } = scenariosFile.scenarioResilience;

const RISK_CLASS: Record<string, string> = {
  'Low concentration risk': 'border-accent-green/40 text-accent-green',
  'Moderate concentration risk': 'border-accent-orange/40 text-accent-orange',
  'High concentration risk': 'border-accent-red/40 text-accent-red',
};

/** Streamlit Module 4 — Supplier Alternatives (app.py lines 2340-2408). */
export function SupplierAlternatives() {
  const [shares, setShares] = useState(supplierAlternatives.defaultSpendMix.map((r) => r.spendSharePct));

  const result = useMemo(() => computeHhi(shares, supplierAlternatives.hhiLowMax, supplierAlternatives.hhiModerateMax), [shares]);
  const total = shares.reduce((a, b) => a + b, 0);

  function setShare(i: number, value: number) {
    setShares((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-accent-blue">Raw Material &amp; Supplier Alternatives</p>
            <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Supplier concentration (HHI)</h3>
          </div>
          <DataSourceBadge source="illustrative" />
        </div>
        <p className="mt-1 max-w-2xl font-sans text-sm text-text-secondary">{supplierAlternatives.context}</p>

        <p className="mt-4 font-sans text-sm text-text-secondary">Edit the spend shares below to reflect current or hypothetical sourcing mix (must sum to ~100%).</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
                <th className="py-2 pr-4 font-medium">Supplier / origin</th>
                <th className="py-2 pr-4 text-right font-medium">Spend share (%)</th>
              </tr>
            </thead>
            <tbody className="font-sans text-sm">
              {supplierAlternatives.defaultSpendMix.map((row, i) => (
                <tr key={row.origin} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-4 text-text-primary">{row.origin}</td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={shares[i]}
                      onChange={(e) => setShare(i, Number(e.target.value))}
                      className="w-20 rounded-lg border border-border-subtle bg-bg-primary px-2 py-1 text-right font-mono text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-4 text-text-secondary">Total</td>
                <td className={`py-2 pr-4 text-right font-mono font-tabular ${Math.round(total) === 100 ? 'text-text-secondary' : 'text-accent-orange'}`}>{total}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="rounded-card border border-border-subtle bg-bg-panel-raised p-4">
            <p className="font-sans text-xs font-medium text-text-tertiary">HHI</p>
            <p className="mt-1 font-sans font-tabular text-2xl font-semibold text-text-primary">{result.hhi}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 font-sans text-xs font-medium ${RISK_CLASS[result.riskLabel]}`}>{result.riskLabel}</span>
        </div>
        <p className="mt-3 font-sans text-xs text-text-tertiary">{supplierAlternatives.bandsCaption}</p>
      </section>

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-sans text-lg font-semibold text-text-primary">Pre-identified alternate suppliers</h3>
          <DataSourceBadge source="illustrative" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
                <th className="py-2 pr-4 font-medium">Alternate supplier</th>
                <th className="py-2 pr-4 text-right font-medium">Cost delta vs current</th>
                <th className="py-2 pr-4 text-right font-medium">Lead-time delta</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {supplierAlternatives.alternateSuppliers.map((row) => (
                <tr key={row.supplier} className="border-b border-border-subtle/60 last:border-0">
                  <td className="py-2 pr-4 font-sans text-text-primary">{row.supplier}</td>
                  <td className="py-2 pr-4 text-right font-tabular text-accent-orange">
                    {row.costDeltaPct > 0 ? '+' : ''}
                    {row.costDeltaPct}%
                  </td>
                  <td className="py-2 pr-4 text-right font-tabular text-accent-green">
                    {row.leadTimeDeltaDays > 0 ? '+' : ''}
                    {row.leadTimeDeltaDays} day{Math.abs(row.leadTimeDeltaDays) === 1 ? '' : 's'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
