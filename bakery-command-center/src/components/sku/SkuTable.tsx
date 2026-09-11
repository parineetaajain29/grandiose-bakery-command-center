import type { Sku } from '../../lib/skuCalc';
import { formatSkuAed } from '../../lib/skuCalc';
import type { Division } from '../../data/skuData';

interface SkuTableProps {
  divisions: Division[];
  products: Sku[];
  selectedSku: string | null;
  onSelect: (sku: string) => void;
}

/** One <details> per division — app.py's st.expander("{division} · {N} SKUs"), same idea with a native element. */
export function SkuTable({ divisions, products, selectedSku, onSelect }: SkuTableProps) {
  return (
    <div className="flex flex-col gap-3">
      {divisions.map((division) => {
        const rows = products.filter((p) => p.division === division);
        if (rows.length === 0) return null;
        const isSeasonal = division === 'Seasonal Collection';
        return (
          <details key={division} className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7" open={rows.length <= 6}>
            <summary className="cursor-pointer font-sans text-base font-semibold text-text-primary">
              {division} · {rows.length} SKUs
              {isSeasonal && rows[0]?.collection ? ` — ${rows[0].collection}` : ''}
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-subtle font-mono text-[11px] tracking-wide text-text-secondary">
                    <th className="py-2 pr-4 font-normal">SKU</th>
                    <th className="py-2 pr-4 font-normal">Product</th>
                    <th className="py-2 pr-4 text-right font-normal">Units sold</th>
                    <th className="py-2 pr-4 text-right font-normal">Sales value</th>
                    <th className="py-2 pr-4 text-right font-normal">Contr. %</th>
                    <th className="py-2 pr-4 text-right font-normal">Rank</th>
                    {isSeasonal && <th className="py-2 pr-4 font-normal">Availability</th>}
                  </tr>
                </thead>
                <tbody className="font-mono text-sm">
                  {rows.map((row) => (
                    <tr
                      key={row.sku}
                      onClick={() => onSelect(row.sku)}
                      className={`cursor-pointer border-b border-border-subtle/60 last:border-0 ${row.sku === selectedSku ? 'bg-accent-blue/10' : ''}`}
                    >
                      <td className="py-2 pr-4 text-text-primary">{row.sku}</td>
                      <td className="py-2 pr-4 text-text-primary">{row.product}</td>
                      <td className="py-2 pr-4 text-right font-tabular text-text-secondary">{row.units.toLocaleString('en-AE')}</td>
                      <td className="py-2 pr-4 text-right font-tabular text-text-secondary">{formatSkuAed(row.salesAed)}</td>
                      <td className="py-2 pr-4 text-right font-tabular text-text-secondary">{row.contributionPct.toFixed(1)}%</td>
                      <td className="py-2 pr-4 text-right font-tabular text-text-secondary">#{row.rank}</td>
                      {isSeasonal && <td className="py-2 pr-4 text-text-secondary">{row.availability}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}
