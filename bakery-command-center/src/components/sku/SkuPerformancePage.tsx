import { useMemo, useState } from 'react';
import { DIVISIONS, SKU_DIVISION_COLORS } from '../../data/skuData';
import { loadProducts, skuKpiCards } from '../../lib/skuCalc';
import { SkuBubbleChart } from './SkuBubbleChart';
import { SkuTable } from './SkuTable';
import { DataSourceBadge } from '../shared/DataSourceBadge';

const ALL_PRODUCTS = loadProducts();

const TONE_CLASS: Record<'up' | 'down' | 'none', string> = {
  up: 'text-accent-green',
  down: 'text-accent-red',
  none: 'text-text-secondary',
};

/** Ported from the Streamlit SKU / Bakery Product Performance page (app.py lines 3006-3126). */
export function SkuPerformancePage() {
  const [divisionFilter, setDivisionFilter] = useState<'All' | (typeof DIVISIONS)[number]>('All');
  const [search, setSearch] = useState('');
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ALL_PRODUCTS.filter((p) => {
      if (divisionFilter !== 'All' && p.division !== divisionFilter) return false;
      if (query && !p.sku.toLowerCase().includes(query) && !p.product.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [divisionFilter, search]);

  // A bubble selected via a division that's since been filtered out is deselected, same as the source (app.py lines 3050-3053).
  const visibleSelectedSku = selectedSku && filtered.some((p) => p.sku === selectedSku) ? selectedSku : null;
  const selected = visibleSelectedSku ? ALL_PRODUCTS.find((p) => p.sku === visibleSelectedSku) ?? null : null;

  const kpiCards = useMemo(() => skuKpiCards(ALL_PRODUCTS), []);
  const chartDivisions = divisionFilter === 'All' ? [...DIVISIONS] : [divisionFilter];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">SKU PERFORMANCE</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Bakery product performance</h2>
        </div>
        <DataSourceBadge source="illustrative" />
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-bg-panel p-5">
            <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">{card.label.toUpperCase()}</p>
            <p className={`mt-3 font-sans font-tabular text-xl font-semibold sm:text-2xl ${card.accent ? 'text-accent-blue' : 'text-text-primary'}`}>{card.value}</p>
            {card.sub && <p className={`mt-2 font-mono text-xs ${TONE_CLASS[card.trend ?? 'none']}`}>{card.sub}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border-subtle bg-bg-panel p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Division filter">
            {(['All', ...DIVISIONS] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDivisionFilter(d)}
                className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  divisionFilter === d ? 'border-accent-blue text-accent-blue' : 'border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU or product…"
            className="w-full max-w-xs rounded-full border border-border-subtle bg-bg-panel px-4 py-2 font-mono text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-blue/60 focus:outline-none"
          />
        </div>

        {selected && (
          <div className="mt-4 flex items-center gap-3 rounded-full border border-accent-blue/40 bg-accent-blue/10 px-4 py-2">
            <p className="font-mono text-xs text-text-primary">
              Selected · {selected.product} ({selected.sku}) — {selected.division}
            </p>
            <button type="button" onClick={() => setSelectedSku(null)} className="font-mono text-[11px] text-accent-blue hover:underline">
              Clear
            </button>
          </div>
        )}

        <div className="mt-5">
          <SkuBubbleChart divisions={chartDivisions} products={filtered} selectedSku={visibleSelectedSku} onSelect={setSelectedSku} />
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {chartDivisions.map((d) => (
            <div key={d} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SKU_DIVISION_COLORS[d] }} />
              <span className="font-mono text-[10px] tracking-wide text-text-secondary">{d.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center font-mono text-[10px] text-text-secondary">Bubble size = units sold. Hover for detail, click to select.</p>
      </section>

      <SkuTable divisions={chartDivisions} products={filtered} selectedSku={visibleSelectedSku} onSelect={setSelectedSku} />

      <p className="font-mono text-[11px] text-text-secondary">
        Figures are illustrative pending Grandiose-provided SKU actuals. Contribution % is each SKU's share of total
        bakery sales; rank is by sales value across all divisions.
      </p>
    </div>
  );
}
