import { useEffect, useMemo, useState } from 'react';
import type { AnalysisContext } from '../../data';
import { DIVISIONS, SKU_DIVISION_COLORS } from '../../data/skuData';
import { loadProducts, skuKpiCards, type Sku } from '../../lib/skuCalc';
import { SkuBubbleChart } from './SkuBubbleChart';
import { SkuTable } from './SkuTable';
import { DataSourceBadge } from '../shared/DataSourceBadge';
import { exportCsv, exportXlsx, type TableSheet } from '../../data/api';
import { ExportMenu } from '../shared/ExportMenu';

const ALL_PRODUCTS = loadProducts();

/** Exports whatever the division filter/search currently narrow the table
 * and bubble chart down to — not always the full 110-SKU catalogue — so the
 * export matches what's actually on screen, same as every other page. */
function buildSkuPerformanceSheet(products: Sku[]): TableSheet {
  return {
    name: 'SKU Performance',
    columns: ['SKU', 'Product', 'Division', 'Units Sold', 'Sales (AED)', 'Contribution %', 'Rank', 'Availability'],
    rows: products.map((p) => [p.sku, p.product, p.division, p.units, p.salesAed, p.contributionPct, p.rank, p.availability ?? '']),
  };
}

const TONE_CLASS: Record<'up' | 'down' | 'none', string> = {
  up: 'text-accent-green',
  down: 'text-accent-red',
  none: 'text-text-secondary',
};

/** context.division is a general string (shared across every AnalysisContext
 * destination), so it's validated against the real DIVISIONS union at
 * runtime rather than blindly cast — it happens to always be one of these six
 * today (the only source is Performance Tracker's wastageByDivision, which
 * uses this exact same division set), but this doesn't assume that forever. */
function initialDivisionFilter(context: AnalysisContext | null | undefined): 'All' | (typeof DIVISIONS)[number] {
  if (context?.division && (DIVISIONS as readonly string[]).includes(context.division)) {
    return context.division as (typeof DIVISIONS)[number];
  }
  return 'All';
}

interface SkuPerformancePageProps {
  /** Set when arriving via "Analyse affected SKUs ->" from Performance
   * Tracker. Optional — direct-tab navigation has no context and behaves
   * exactly as before. Only seeds divisionFilter once, on mount; the user
   * can freely change it afterward like any other filter click. */
  context?: AnalysisContext | null;
  /** Called once after mount if `context` was present, so App.tsx can clear
   * its handoff state — otherwise leaving this page and returning later
   * (without a fresh handoff) would silently re-seed the same stale
   * division again, which would look like an unexplained bug, not a filter. */
  onContextConsumed?: () => void;
}

/** Ported from the Streamlit SKU / Bakery Product Performance page (app.py lines 3006-3126). */
export function SkuPerformancePage({ context, onContextConsumed }: SkuPerformancePageProps) {
  const [divisionFilter, setDivisionFilter] = useState<'All' | (typeof DIVISIONS)[number]>(() =>
    initialDivisionFilter(context),
  );
  const [search, setSearch] = useState('');
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  useEffect(() => {
    if (context) onContextConsumed?.();
    // Runs once on mount only — the seed above already happened in the
    // lazy useState initializer; this just signals "consumed" afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="font-sans text-xs font-medium text-text-tertiary">SKU Performance</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Bakery product performance</h2>
        </div>
        <div className="flex items-center gap-3">
          <DataSourceBadge source="illustrative" />
          <ExportMenu
            label="Export Data"
            options={[
              { label: 'Excel', onExport: () => exportXlsx([buildSkuPerformanceSheet(filtered)]) },
              { label: 'CSV', onExport: () => exportCsv(buildSkuPerformanceSheet(filtered)) },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle shadow-card sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-bg-panel p-5">
            <p className="font-sans text-xs font-medium text-text-tertiary">{card.label}</p>
            <p className={`mt-3 font-sans font-tabular text-xl font-semibold sm:text-2xl ${card.accent ? 'text-accent-blue' : 'text-text-primary'}`}>{card.value}</p>
            {card.sub && <p className={`mt-2 font-sans text-xs font-medium ${TONE_CLASS[card.trend ?? 'none']}`}>{card.sub}</p>}
          </div>
        ))}
      </div>

      <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Division filter">
            {(['All', ...DIVISIONS] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDivisionFilter(d)}
                className={`rounded-full border px-3 py-1.5 font-sans text-xs font-medium transition-colors ${
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
            className="w-full max-w-xs rounded-full border border-border-subtle bg-bg-panel px-4 py-2 font-sans text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-blue/60 focus:outline-none"
          />
        </div>

        {selected && (
          <div className="mt-4 flex items-center gap-3 rounded-full border border-accent-blue/40 bg-accent-blue/10 px-4 py-2">
            <p className="font-sans text-xs text-text-primary">
              Selected · {selected.product} ({selected.sku}) — {selected.division}
            </p>
            <button type="button" onClick={() => setSelectedSku(null)} className="font-sans text-xs text-accent-blue hover:underline">
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
              <span className="font-sans text-[11px] font-medium text-text-secondary">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center font-sans text-[11px] text-text-tertiary">Bubble size = units sold. Hover for detail, click to select.</p>
      </section>

      <SkuTable divisions={chartDivisions} products={filtered} selectedSku={visibleSelectedSku} onSelect={setSelectedSku} />

      <p className="font-sans text-xs text-text-tertiary">
        Figures are illustrative pending Grandiose-provided SKU actuals. Contribution % is each SKU's share of total
        bakery sales; rank is by sales value across all divisions.
      </p>
    </div>
  );
}
