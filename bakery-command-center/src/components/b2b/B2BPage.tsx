import { useMemo, useState } from 'react';
import { scenariosFile } from '../../data';
import { deltaTone, formatCurrencyPrecise, formatDelta, formatPercentPrecise } from '../../lib/format';
import { deriveB2BSummary, deriveReceivables } from '../../lib/b2bCalc';
import { B2BSubNav, type B2BSubTab } from './B2BSubNav';
import { RevenueVsCostChart } from './RevenueVsCostChart';
import { CapacityEconomics } from './CapacityEconomics';
import { ConcentrationRisk } from './ConcentrationRisk';
import { AccountTable } from './AccountTable';
import { ReceivablesPanel } from './ReceivablesPanel';
import { DeliveryFeed } from './DeliveryFeed';
import { DataSourceBadge } from '../shared/DataSourceBadge';

const { b2b, performanceTracker } = scenariosFile;

const TONE_CLASS: Record<'green' | 'red' | 'neutral', string> = {
  green: 'text-accent-green',
  red: 'text-accent-red',
  neutral: 'text-text-secondary',
};

function KpiCard({ eyebrow, value, caption, tone = 'neutral' }: { eyebrow: string; value: string; caption: string; tone?: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="bg-bg-panel p-5">
      <p className="font-sans text-xs font-medium text-text-tertiary">{eyebrow}</p>
      <p className="mt-3 font-sans font-tabular text-2xl font-semibold text-text-primary sm:text-[28px]">{value}</p>
      <p className={`mt-2 font-sans text-xs font-medium ${TONE_CLASS[tone]}`}>{caption}</p>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-8 text-center">
      <p className="font-sans text-sm text-text-secondary">{label} — coming in a later phase.</p>
    </section>
  );
}

export function B2BPage() {
  const [tab, setTab] = useState<B2BSubTab>('Overview');
  const [search, setSearch] = useState('');

  // Revenue, net margin, OTIF, and collection days are all derived live from
  // `clients` (Phase 6 migration fix) — never stored as independent flat
  // numbers that could drift from what the Account Profitability table and
  // Receivables panel actually show.
  const summary = useMemo(() => deriveB2BSummary(b2b.clients), []);
  const receivables = useMemo(() => deriveReceivables(b2b.clients), []);

  // Reused from Command Center's own Performance Tracker gross margin,
  // matching the Streamlit source's explicit RETAIL_MARGIN_PCT_BENCHMARK
  // design (b2b_data.py) rather than an independently-invented number.
  const retailMarginPct = performanceTracker.baseline.grossMarginPct;
  const netMarginDelta = summary.netMarginPct === null ? undefined : summary.netMarginPct - retailMarginPct;

  const collectionsVsTerms = summary.collectionDays !== null ? summary.collectionDays - b2b.summary.supplierTermsDaysContext : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-medium text-text-tertiary">B2B Performance</p>
          <h2 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Client account economics</h2>
        </div>
        <DataSourceBadge source="illustrative" />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <B2BSubNav active={tab} onChange={setTab} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client name or location…"
          className="w-full max-w-xs rounded-full border border-border-subtle bg-bg-panel px-4 py-2 font-sans text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-blue/60 focus:outline-none lg:w-64"
        />
      </div>

      {tab !== 'Overview' && <Placeholder label={tab} />}

      {tab === 'Overview' && (
        <>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle shadow-card sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard eyebrow="B2B Revenue" value={formatCurrencyPrecise(summary.revenue)} caption={`${formatDelta(b2b.summary.revenueDeltaPct)} MoM`} tone={deltaTone(b2b.summary.revenueDeltaPct)} />
            <KpiCard
              eyebrow="Net Margin After Service Cost"
              value={formatPercentPrecise(summary.netMarginPct)}
              caption={netMarginDelta === undefined ? '—' : `${formatDelta(netMarginDelta)} vs. retail margin (${formatPercentPrecise(retailMarginPct)})`}
              tone={deltaTone(netMarginDelta)}
            />
            <KpiCard
              eyebrow="OTIF Rate"
              value={formatPercentPrecise(summary.otifPct)}
              caption={`${summary.otifLateCount} late drop${summary.otifLateCount === 1 ? '' : 's'} this period`}
              tone={summary.otifLateCount > 0 ? 'red' : 'green'}
            />
            <KpiCard
              eyebrow="Avg Collection Days"
              value={summary.collectionDays === null ? '—' : `${summary.collectionDays.toFixed(0)}d`}
              caption={`vs. ${b2b.summary.supplierTermsDaysContext}-day supplier terms`}
              tone={collectionsVsTerms !== null && collectionsVsTerms > 0 ? 'red' : 'neutral'}
            />
          </div>

          {collectionsVsTerms !== null && (
            <p className="font-sans text-xs text-text-tertiary">
              Customer collections average {summary.collectionDays!.toFixed(0)} days against {b2b.summary.supplierTermsDaysContext}-day
              supplier payment terms — Grandiose collects from B2B customers slower than it pays its own suppliers, a working-capital
              gap worth watching as B2B volume grows. Pending GM confirmation on real collection-days data.
            </p>
          )}

          <RevenueVsCostChart weeklyTrend={b2b.weeklyTrend} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <CapacityEconomics capacity={b2b.capacity} />
            <ConcentrationRisk clients={b2b.clients} />
          </div>

          <AccountTable clients={b2b.clients} searchQuery={search} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ReceivablesPanel receivables={receivables} clients={b2b.clients} />
            <DeliveryFeed deliveries={b2b.recentDeliveries} />
          </div>
        </>
      )}
    </div>
  );
}
