import { useMemo, useState } from 'react';
import type { B2BClient } from '../../data';
import { filterClients, sortClients, type ClientSortKey } from '../../lib/b2bCalc';
import { formatCurrencyPrecise, formatPercentPrecise } from '../../lib/format';

interface AccountTableProps {
  clients: B2BClient[];
  searchQuery: string;
}

const COLUMNS: { key: ClientSortKey; label: string; align?: 'right' }[] = [
  { key: 'name', label: 'Client' },
  { key: 'revenue', label: 'Revenue', align: 'right' },
  { key: 'marginPct', label: 'Margin', align: 'right' },
  { key: 'marginalMarginPct', label: 'Marginal', align: 'right' },
  { key: 'otifPct', label: 'OTIF', align: 'right' },
];

function marginToneClass(pct: number): string {
  if (pct >= 20) return 'text-accent-green';
  if (pct >= 0) return 'text-accent-orange';
  return 'text-accent-red';
}

function otifToneClass(pct: number): string {
  return pct < 90 ? 'text-accent-red' : 'text-text-primary';
}

export function AccountTable({ clients, searchQuery }: AccountTableProps) {
  const [sortKey, setSortKey] = useState<ClientSortKey>('revenue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const filtered = filterClients(clients, searchQuery);
    return sortClients(filtered, sortKey, sortDirection);
  }, [clients, searchQuery, sortKey, sortDirection]);

  const flippedAccount = clients.find((c) => c.marginPct < 0 && c.marginalMarginPct >= 0);

  function toggleSort(key: ClientSortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  }

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Accounts</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Account profitability</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
              {COLUMNS.map((col) => (
                <th key={col.key} className={`py-2 pr-4 font-medium ${col.align === 'right' ? 'text-right' : ''}`}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name} className="border-b border-border-subtle/60 text-sm last:border-0">
                <td className="py-2.5 pr-4">
                  <p className="font-sans text-text-primary">{c.name}</p>
                  <p className="font-sans text-xs text-text-tertiary">
                    {c.location} · {c.frequency}
                  </p>
                </td>
                <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-primary">
                  {formatCurrencyPrecise(c.revenue)}
                </td>
                <td className={`py-2.5 pr-4 text-right font-mono font-tabular font-semibold ${marginToneClass(c.marginPct)}`}>
                  {formatPercentPrecise(c.marginPct)}
                </td>
                <td className={`py-2.5 pr-4 text-right font-mono font-tabular font-semibold ${marginToneClass(c.marginalMarginPct)}`}>
                  {formatPercentPrecise(c.marginalMarginPct)}
                </td>
                <td className={`py-2.5 pr-4 text-right font-mono font-tabular ${otifToneClass(c.otifPct)}`}>
                  {formatPercentPrecise(c.otifPct)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center font-sans text-xs text-text-secondary">
                  No accounts match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {flippedAccount && (
        <p className="mt-3 font-sans text-xs text-text-tertiary">
          {flippedAccount.name} is negative on full absorption ({formatPercentPrecise(flippedAccount.marginPct)}) but
          positive at the margin ({formatPercentPrecise(flippedAccount.marginalMarginPct)}) — it fills otherwise-idle
          capacity, so the order is still worth taking even though it doesn't cover its full allocated cost.
        </p>
      )}
    </section>
  );
}
