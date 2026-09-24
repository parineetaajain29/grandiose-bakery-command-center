import { useMemo, useState } from 'react';
import type { B2BDelivery } from '../../data';
import { filterDeliveries, sortDeliveries, type DeliverySortKey } from '../../lib/b2bCalc';
import { formatCurrencyPrecise } from '../../lib/format';

interface OrdersTableProps {
  deliveries: B2BDelivery[];
  searchQuery: string;
}

const COLUMNS: { key: DeliverySortKey | 'client' | 'status'; label: string; align?: 'right'; sortable: boolean }[] = [
  { key: 'client', label: 'Client', sortable: false },
  { key: 'time', label: 'Time', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'value', label: 'Value', align: 'right', sortable: true },
];

/**
 * b2b.recentDeliveries is the entire real delivery dataset — 8 records, no
 * date field, nothing behind it — not a "recent" slice of a larger order
 * history. This is a sortable/filterable table over that same real data
 * (client and location genuinely support filtering; time and value
 * genuinely support sorting), not a bigger dataset than what exists.
 */
export function OrdersTable({ deliveries, searchQuery }: OrdersTableProps) {
  const [sortKey, setSortKey] = useState<DeliverySortKey>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const filtered = filterDeliveries(deliveries, searchQuery);
    return sortDeliveries(filtered, sortKey, sortDirection);
  }, [deliveries, searchQuery, sortKey, sortDirection]);

  function toggleSort(key: DeliverySortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  }

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-text-tertiary">Orders</p>
      <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">All recorded deliveries</h2>
      <p className="mt-1 max-w-2xl font-sans text-xs text-text-tertiary">
        Showing all {deliveries.length} deliveries in the dataset — this is the complete real delivery record, not a
        slice of a larger order history (there's no date field or additional records behind it).
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
              {COLUMNS.map((col) => (
                <th key={col.key} className={`py-2 pr-4 font-medium ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key as DeliverySortKey)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                    >
                      {col.label}
                      {sortKey === col.key && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={`${d.client}-${i}`} className="border-b border-border-subtle/60 text-sm last:border-0">
                <td className="py-2.5 pr-4">
                  <p className="font-sans text-text-primary">{d.client}</p>
                  <p className="font-sans text-xs text-text-tertiary">{d.location}</p>
                </td>
                <td className="py-2.5 pr-4 font-mono font-tabular text-text-primary">{d.time}</td>
                <td className="py-2.5 pr-4 font-sans">
                  {d.onTime ? (
                    <span className="text-accent-green">On time</span>
                  ) : (
                    <span className="text-accent-red">Late{d.delayMinutes !== undefined ? ` +${d.delayMinutes}m` : ''}</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono font-tabular text-text-primary">{formatCurrencyPrecise(d.value)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center font-sans text-xs text-text-secondary">
                  No deliveries match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
