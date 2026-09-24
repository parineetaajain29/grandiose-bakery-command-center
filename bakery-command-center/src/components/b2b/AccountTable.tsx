import { useMemo, useState, type ReactNode } from 'react';
import type { B2BClient } from '../../data';
import { filterClients, sortClients, type ClientSortKey } from '../../lib/b2bCalc';
import { formatCurrencyPrecise, formatPercentPrecise } from '../../lib/format';

export interface AccountTableColumn {
  key: ClientSortKey;
  label: string;
  align?: 'right';
  /** Extra classes appended to this column's <td>, beyond the shared base
   * (py-2.5 pr-4, plus text-right when align is 'right') — mirrors what
   * each column's cell literally had inline before this became configurable. */
  cellClassName?: (c: B2BClient) => string;
  render: (c: B2BClient) => ReactNode;
}

function marginToneClass(pct: number): string {
  if (pct >= 20) return 'text-accent-green';
  if (pct >= 0) return 'text-accent-orange';
  return 'text-accent-red';
}

function otifToneClass(pct: number): string {
  return pct < 90 ? 'text-accent-red' : 'text-text-primary';
}

/** True when this client's receivable has aged past their own contracted
 * terms — same real per-client rule ReceivablesByClient.tsx already uses,
 * reused here rather than a second invented threshold. */
function pastOwnTerms(c: B2BClient): boolean {
  return c.daysOutstanding > c.paymentTermsDays;
}

/** Overview's original 5 columns, unchanged — this is the default so
 * Overview's call site and rendered output stay byte-for-byte identical. */
export const DEFAULT_COLUMNS: AccountTableColumn[] = [
  {
    key: 'name',
    label: 'Client',
    render: (c) => (
      <>
        <p className="font-sans text-text-primary">{c.name}</p>
        <p className="font-sans text-xs text-text-tertiary">
          {c.location} · {c.frequency}
        </p>
      </>
    ),
  },
  {
    key: 'revenue',
    label: 'Revenue',
    align: 'right',
    cellClassName: () => 'font-mono font-tabular text-text-primary',
    render: (c) => formatCurrencyPrecise(c.revenue),
  },
  {
    key: 'marginPct',
    label: 'Margin',
    align: 'right',
    cellClassName: (c) => `font-mono font-tabular font-semibold ${marginToneClass(c.marginPct)}`,
    render: (c) => formatPercentPrecise(c.marginPct),
  },
  {
    key: 'marginalMarginPct',
    label: 'Marginal',
    align: 'right',
    cellClassName: (c) => `font-mono font-tabular font-semibold ${marginToneClass(c.marginalMarginPct)}`,
    render: (c) => formatPercentPrecise(c.marginalMarginPct),
  },
  {
    key: 'otifPct',
    label: 'OTIF',
    align: 'right',
    cellClassName: (c) => `font-mono font-tabular ${otifToneClass(c.otifPct)}`,
    render: (c) => formatPercentPrecise(c.otifPct),
  },
];

/** The 6 real B2BClient fields not shown anywhere else as a browsable table
 * column (confirmed by grep — they only appear in tooltips or the Excel
 * export) — appended after Overview's 5 for the Client list tab's full
 * directory view. No new field invented; every value below already exists
 * on B2BClient. */
export const DETAIL_COLUMNS: AccountTableColumn[] = [
  {
    key: 'serviceCost',
    label: 'Service Cost',
    align: 'right',
    cellClassName: () => 'font-mono font-tabular text-text-secondary',
    render: (c) => formatCurrencyPrecise(c.serviceCost),
  },
  {
    key: 'totalDeliveries',
    label: 'Deliveries',
    align: 'right',
    cellClassName: () => 'font-mono font-tabular text-text-secondary',
    render: (c) => `${c.onTimeCount}/${c.totalDeliveries}`,
  },
  {
    key: 'paymentTermsDays',
    label: 'Terms',
    align: 'right',
    cellClassName: () => 'font-mono font-tabular text-text-secondary',
    render: (c) => `${c.paymentTermsDays}d`,
  },
  {
    key: 'receivableAmount',
    label: 'Outstanding',
    align: 'right',
    cellClassName: (c) => `font-mono font-tabular font-semibold ${pastOwnTerms(c) ? 'text-accent-red' : 'text-text-primary'}`,
    render: (c) => formatCurrencyPrecise(c.receivableAmount),
  },
  {
    key: 'daysOutstanding',
    label: 'Days Out.',
    align: 'right',
    cellClassName: (c) => `font-mono font-tabular ${pastOwnTerms(c) ? 'font-semibold text-accent-red' : 'text-text-secondary'}`,
    render: (c) => `${c.daysOutstanding}d`,
  },
];

interface AccountTableProps {
  clients: B2BClient[];
  searchQuery: string;
  columns?: AccountTableColumn[];
  eyebrow?: string;
  title?: string;
}

export function AccountTable({ clients, searchQuery, columns = DEFAULT_COLUMNS, eyebrow = 'Accounts', title = 'Account profitability' }: AccountTableProps) {
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
      <p className="font-sans text-xs font-medium text-text-tertiary">{eyebrow}</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">{title}</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
              {columns.map((col) => (
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
                {columns.map((col) => (
                  <td key={col.key} className={`py-2.5 pr-4 ${col.align === 'right' ? 'text-right' : ''} ${col.cellClassName ? col.cellClassName(c) : ''}`}>
                    {col.render(c)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center font-sans text-xs text-text-secondary">
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
