import { useMemo, useState } from 'react';
import { scenariosFile } from '../../data';
import type { B2BClient, B2BReceivables } from '../../data';
import { deltaTone, formatCurrencyPrecise, formatDelta, formatPercentPrecise } from '../../lib/format';
import { deriveB2BSummary, deriveReceivables, filterClients } from '../../lib/b2bCalc';
import { B2BSubNav, type B2BSubTab } from './B2BSubNav';
import { RevenueVsCostChart } from './RevenueVsCostChart';
import { CapacityEconomics } from './CapacityEconomics';
import { ConcentrationRisk } from './ConcentrationRisk';
import { AccountTable, DEFAULT_COLUMNS, DETAIL_COLUMNS } from './AccountTable';
import { OrdersTable } from './OrdersTable';
import { ReceivablesPanel, BUCKET_LABELS } from './ReceivablesPanel';
import { DeliveryFeed } from './DeliveryFeed';
import { DeliveryVolumeShare } from './DeliveryVolumeShare';
import { RevenueMarginBubble } from './RevenueMarginBubble';
import { OtifRankedBar } from './OtifRankedBar';
import { ReceivablesByClient } from './ReceivablesByClient';
import { CashConversionInsight } from './CashConversionInsight';
import { DataSourceBadge } from '../shared/DataSourceBadge';
import { exportCsv, exportXlsx, type TableSheet } from '../../data/api';
import { ExportMenu } from '../shared/ExportMenu';

const { b2b, performanceTracker } = scenariosFile;

/** Accounts + Receivables Aging — matches this page's two named export
 * targets. Accounts respects the current search filter (via the same real
 * filterClients() AccountTable itself calls), but not any column sort the
 * user has clicked into — that sort state is local to AccountTable and never
 * escapes it; lifting it up just for export felt like more structural change
 * than this feature calls for, so the export stays in filterClients()'s
 * natural order (unsorted) rather than mirroring every live sort click. */
function buildB2BSheets(clients: B2BClient[], receivables: B2BReceivables, search: string): TableSheet[] {
  const filtered = filterClients(clients, search);
  const accountsSheet: TableSheet = {
    name: 'Accounts',
    columns: ['Client', 'Location', 'Frequency', 'Revenue (AED)', 'Service Cost (AED)', 'Margin %', 'Marginal Margin %', 'OTIF %', 'Payment Terms (days)'],
    rows: filtered.map((c) => [c.name, c.location, c.frequency, c.revenue, c.serviceCost, c.marginPct, c.marginalMarginPct, c.otifPct, c.paymentTermsDays]),
  };

  const receivablesSheet: TableSheet = {
    name: 'Receivables Aging',
    columns: ['Bucket', 'Amount (AED)'],
    rows: [
      ...receivables.buckets.map((v, i): (string | number)[] => [BUCKET_LABELS[i], v]),
      ['Total Outstanding', receivables.total],
      ['Past 60 Days', receivables.past60],
    ],
  };

  return [accountsSheet, receivablesSheet];
}

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
        <div className="flex items-center gap-3">
          <DataSourceBadge source="illustrative" />
          <ExportMenu
            label="Export Data"
            options={[
              { label: 'Excel (Accounts + Receivables)', onExport: () => exportXlsx(buildB2BSheets(b2b.clients, receivables, search)) },
              { label: 'Accounts (CSV)', onExport: () => exportCsv(buildB2BSheets(b2b.clients, receivables, search)[0]) },
              { label: 'Receivables Aging (CSV)', onExport: () => exportCsv(buildB2BSheets(b2b.clients, receivables, search)[1]) },
            ]}
          />
        </div>
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

          {summary.collectionDays !== null && (
            <CashConversionInsight collectionDays={summary.collectionDays} supplierTermsDays={b2b.summary.supplierTermsDaysContext} />
          )}

          <DeliveryVolumeShare clients={b2b.clients} />

          <RevenueVsCostChart weeklyTrend={b2b.weeklyTrend} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <CapacityEconomics capacity={b2b.capacity} />
            <ConcentrationRisk clients={b2b.clients} />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <RevenueMarginBubble clients={b2b.clients} retailMarginPct={retailMarginPct} />
            <OtifRankedBar clients={b2b.clients} />
          </div>

          <AccountTable clients={b2b.clients} searchQuery={search} columns={DEFAULT_COLUMNS} />

          <DeliveryFeed deliveries={b2b.recentDeliveries} />
        </>
      )}

      {tab === 'Client list' && (
        <AccountTable
          clients={b2b.clients}
          searchQuery={search}
          columns={[...DEFAULT_COLUMNS, ...DETAIL_COLUMNS]}
          eyebrow="Client Directory"
          title="Full client directory"
        />
      )}

      {tab === 'Orders' && <OrdersTable deliveries={b2b.recentDeliveries} searchQuery={search} />}

      {tab === 'Receivables' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <ReceivablesPanel receivables={receivables} />
          <ReceivablesByClient clients={b2b.clients} />
        </div>
      )}
    </div>
  );
}
