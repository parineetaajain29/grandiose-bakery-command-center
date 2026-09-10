import { useState } from 'react';
import { scenariosFile } from '../../data';
import { deltaTone, formatCurrencyPrecise, formatDelta, formatPercentPrecise } from '../../lib/format';
import { B2BSubNav, type B2BSubTab } from './B2BSubNav';
import { RevenueVsCostChart } from './RevenueVsCostChart';
import { CapacityEconomics } from './CapacityEconomics';
import { ConcentrationRisk } from './ConcentrationRisk';
import { AccountTable } from './AccountTable';
import { ReceivablesPanel } from './ReceivablesPanel';
import { DeliveryFeed } from './DeliveryFeed';

const { b2b } = scenariosFile;

const TONE_CLASS: Record<'green' | 'red' | 'neutral', string> = {
  green: 'text-accent-green',
  red: 'text-accent-red',
  neutral: 'text-text-secondary',
};

function KpiCard({ eyebrow, value, caption, tone = 'neutral' }: { eyebrow: string; value: string; caption: string; tone?: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="bg-bg-panel p-5">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">{eyebrow}</p>
      <p className="mt-3 font-sans font-tabular text-2xl font-semibold text-text-primary sm:text-[28px]">{value}</p>
      <p className={`mt-2 font-mono text-xs ${TONE_CLASS[tone]}`}>{caption}</p>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-bg-panel p-8 text-center">
      <p className="font-mono text-sm text-text-secondary">{label} — coming in a later phase.</p>
    </section>
  );
}

export function B2BPage() {
  const [tab, setTab] = useState<B2BSubTab>('Overview');
  const [search, setSearch] = useState('');

  const netMarginDelta = b2b.summary.netMarginPct - b2b.summary.retailMarginPct;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <B2BSubNav active={tab} onChange={setTab} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client name or location…"
          className="w-full max-w-xs rounded-full border border-border-subtle bg-bg-panel px-4 py-2 font-mono text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-blue/60 focus:outline-none lg:w-64"
        />
      </div>

      {tab !== 'Overview' && <Placeholder label={tab} />}

      {tab === 'Overview' && (
        <>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard eyebrow="B2B REVENUE" value={formatCurrencyPrecise(b2b.summary.revenue)} caption={`${formatDelta(b2b.summary.revenueDeltaPct)} MoM`} tone={deltaTone(b2b.summary.revenueDeltaPct)} />
            <KpiCard
              eyebrow="NET MARGIN AFTER SERVICE COST"
              value={formatPercentPrecise(b2b.summary.netMarginPct)}
              caption={`${formatDelta(netMarginDelta)} vs. retail margin (${formatPercentPrecise(b2b.summary.retailMarginPct)})`}
              tone={deltaTone(netMarginDelta)}
            />
            <KpiCard
              eyebrow="OTIF RATE"
              value={formatPercentPrecise(b2b.summary.otifPct)}
              caption={`${b2b.summary.otifLateCount} late drop${b2b.summary.otifLateCount === 1 ? '' : 's'} this period`}
              tone={b2b.summary.otifLateCount > 0 ? 'red' : 'green'}
            />
            <KpiCard
              eyebrow="AVG COLLECTION DAYS"
              value={`${b2b.summary.collectionDays}d`}
              caption={`vs. ${b2b.summary.supplierTermsDaysContext}-day supplier terms`}
              tone={b2b.summary.collectionDays > b2b.summary.supplierTermsDaysContext ? 'red' : 'neutral'}
            />
          </div>

          <RevenueVsCostChart weeklyTrend={b2b.weeklyTrend} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <CapacityEconomics capacity={b2b.capacity} />
            <ConcentrationRisk clients={b2b.clients} />
          </div>

          <AccountTable clients={b2b.clients} searchQuery={search} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ReceivablesPanel receivables={b2b.receivables} clients={b2b.clients} />
            <DeliveryFeed deliveries={b2b.recentDeliveries} />
          </div>
        </>
      )}
    </div>
  );
}
