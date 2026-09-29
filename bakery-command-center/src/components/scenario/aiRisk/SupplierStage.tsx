import { useEffect, useState } from 'react';
import {
  runSupplierSearch,
  listSupplierResearchForResearchId,
  type ProcurementSpec,
  type SupplierEvidenceQuality,
  type SupplierResearchRecord,
  type SupplierRow,
} from '../../../data/api';
import { DataSourceBadge } from '../../shared/DataSourceBadge';
import { relativeTime } from './relativeTime';
import { mapMaterialToResource } from './supplierOptimizationScenario';
import { SupplierScenarioTest } from './SupplierScenarioTest';
import { BarChartIcon, BoxIcon, BuildingIcon, CalendarIcon, ChevronDownIcon, FileIcon, GlobeIcon, PinIcon, RefreshIcon, ShieldIcon, SparkleIcon } from './icons';

// Rotates while a search is in flight — same "no fake progress" rule as
// ResearchStage's own baking messages: purely cosmetic phrasing, never a
// percentage, since the frontend has no real visibility into the search.
const SOURCING_MESSAGES = ['Searching for real suppliers…', 'Checking published pricing…', 'Verifying sources…', 'Classifying evidence quality…'];
const SOURCING_MESSAGE_INTERVAL_MS = 5000;

const SPEC_FIELDS: { key: keyof ProcurementSpec; label: string; placeholder: string }[] = [
  { key: 'productSpec', label: 'Product spec', placeholder: 'e.g. unsalted, 82% fat, block' },
  { key: 'quantity', label: 'Approx. quantity', placeholder: 'e.g. 500 kg / month' },
  { key: 'deliveryLocation', label: 'Delivery location', placeholder: 'e.g. Dubai, UAE' },
  { key: 'requiredBy', label: 'Required by', placeholder: 'e.g. within 4 weeks' },
  { key: 'preferredGeography', label: 'Preferred geography', placeholder: 'e.g. GCC, Europe' },
  { key: 'supplierType', label: 'Supplier type', placeholder: 'e.g. Distributor' },
  { key: 'currency', label: 'Preferred currency', placeholder: 'e.g. AED' },
];

const EMPTY_SPEC: ProcurementSpec = {
  productSpec: null,
  quantity: null,
  deliveryLocation: null,
  requiredBy: null,
  preferredGeography: null,
  supplierType: null,
  currency: null,
};

const EVIDENCE_LABEL: Record<SupplierEvidenceQuality, string> = { high: 'High evidence', medium: 'Medium evidence', limited: 'Limited evidence' };
const EVIDENCE_TONE: Record<SupplierEvidenceQuality, string> = {
  high: 'border-accent-green/40 bg-accent-green/10 text-accent-green',
  medium: 'border-accent-orange/40 bg-accent-orange/10 text-accent-orange',
  limited: 'border-border-subtle bg-bg-panel-raised text-text-secondary',
};

function formatPrice(row: SupplierRow): string {
  if (row.priceLevel === 'request_quote' || row.priceAmount === null) return 'Request quote';
  const cur = row.priceCurrency ?? '';
  const unit = row.priceUnit ? ` / ${row.priceUnit}` : '';
  if (row.priceAmountHigh !== null && row.priceAmountHigh !== row.priceAmount) {
    return `${cur} ${row.priceAmount}–${row.priceAmountHigh}${unit}`;
  }
  return `${cur} ${row.priceAmount}${unit}`;
}

function leadTimeSortValue(leadTime: string): number {
  const match = leadTime.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : Number.POSITIVE_INFINITY;
}

const EVIDENCE_RANK: Record<SupplierEvidenceQuality, number> = { high: 0, medium: 1, limited: 2 };

type SortKey = 'none' | 'price' | 'leadTime' | 'evidence';
type EvidenceFilter = 'all' | SupplierEvidenceQuality;

function SupplierCard({ row, onTest }: { row: SupplierRow; onTest?: () => void }) {
  const [showSources, setShowSources] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-sans text-sm font-semibold text-text-primary">{row.name}</p>
            {row.isRetailBenchmark && (
              <span className="rounded-full border border-accent-orange/40 bg-accent-orange/10 px-2 py-0.5 font-sans text-[11px] font-medium text-accent-orange">
                Retail Benchmark
              </span>
            )}
          </div>
          <p className="mt-0.5 font-sans text-xs text-text-tertiary">{row.supplierType}</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-[11px] font-medium ${EVIDENCE_TONE[row.evidenceQuality]}`}>
          <ShieldIcon width={11} height={11} />
          {EVIDENCE_LABEL[row.evidenceQuality]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-sans text-xs text-text-secondary">
        <span className="flex items-center gap-1">
          <GlobeIcon width={13} height={13} className="text-text-tertiary" />
          {row.geography}
        </span>
        <span className="flex items-center gap-1">
          <BoxIcon width={13} height={13} className="text-text-tertiary" />
          {row.product}
        </span>
      </div>
      {row.geographyNote && <p className="font-sans text-xs text-text-tertiary">{row.geographyNote}</p>}

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-bg-panel-raised p-3 sm:grid-cols-4">
        <div>
          <p className="font-sans text-[11px] text-text-tertiary">Indicative price</p>
          <p className="mt-0.5 font-sans text-sm font-semibold text-text-primary">{formatPrice(row)}</p>
          {row.normalizedAedPerKg !== null && <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">≈ AED {row.normalizedAedPerKg}/kg</p>}
        </div>
        <div>
          <p className="font-sans text-[11px] text-text-tertiary">MOQ</p>
          <p className="mt-0.5 font-sans text-sm text-text-primary">{row.moq}</p>
        </div>
        <div>
          <p className="font-sans text-[11px] text-text-tertiary">Lead time</p>
          <p className="mt-0.5 font-sans text-sm text-text-primary">{row.leadTime}</p>
        </div>
        <div>
          <p className="font-sans text-[11px] text-text-tertiary">Availability</p>
          <p className="mt-0.5 font-sans text-sm text-text-primary">{row.availabilityNote}</p>
        </div>
      </div>

      {row.certifications.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.certifications.map((c) => (
            <span key={c} className="rounded-full bg-bg-panel-raised px-2 py-0.5 font-sans text-[11px] text-text-secondary">
              {c}
            </span>
          ))}
        </div>
      )}

      {row.commercialNotes && <p className="font-sans text-xs text-text-secondary">{row.commercialNotes}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <p className="font-mono text-[11px] text-text-tertiary">Last checked {relativeTime(row.retrievedAt)}</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowSources((v) => !v)} className="font-sans text-xs font-medium text-accent-blue hover:underline">
            {showSources ? 'Hide' : 'View'} Sources ({row.sources.length})
          </button>
          {onTest && (
            <button type="button" onClick={onTest} className="flex items-center gap-1 font-sans text-xs font-semibold text-accent-blue hover:underline">
              <BarChartIcon width={12} height={12} />
              Test in Optimization →
            </button>
          )}
        </div>
      </div>

      {showSources && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-panel-raised p-3">
          {row.sources.map((s) => (
            <li key={s.url} className="flex flex-col font-sans text-xs">
              <span className="font-medium text-text-tertiary">{s.label}</span>
              <a href={s.url} target="_blank" rel="noreferrer" className="truncate text-accent-blue hover:underline">
                {s.title || s.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SupplierStageProps {
  material: string;
  researchId: number;
  onBack: () => void;
}

/** The 3rd of 4 AI Risk Intelligence stages ("Research -> Understand ->
 * Suppliers -> Prepare"). Confirms/edits the affected material, takes an
 * optional compact procurement spec, runs (or reuses cached) supplier
 * research, and shows results as evidence-graded cards — never a "best
 * supplier" ranking; management decides. */
export function SupplierStage({ material: initialMaterial, researchId, onBack }: SupplierStageProps) {
  const [material, setMaterial] = useState(initialMaterial);
  const [spec, setSpec] = useState<ProcurementSpec>(EMPTY_SPEC);
  const [showSpecForm, setShowSpecForm] = useState(false);
  const [research, setResearch] = useState<SupplierResearchRecord | null>(null);
  const [cached, setCached] = useState(false);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourcingMessageIndex, setSourcingMessageIndex] = useState(0);

  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all');
  const [geographyFilter, setGeographyFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('none');
  const [testingRow, setTestingRow] = useState<SupplierRow | null>(null);

  // Only butter and flour map to a real optimizer-modeled resource — see
  // supplierOptimizationScenario.ts. "Test in Optimization" only ever
  // appears when this is non-null, honestly reflecting that limitation
  // rather than offering a test the optimizer can't actually model.
  const optimizerResource = mapMaterialToResource(material);

  // On first mount, silently check for a supplier search already run from
  // this AI Risk record — avoids re-spending the shared research budget just
  // for returning to a stage the user already searched from.
  useEffect(() => {
    let cancelled = false;
    listSupplierResearchForResearchId(researchId)
      .then((records) => {
        if (cancelled || records.length === 0) return;
        setResearch(records[0]);
        setCached(true);
        setMaterial(records[0].material);
        setSpec(records[0].spec);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [researchId]);

  useEffect(() => {
    if (!searching) return;
    const interval = setInterval(() => setSourcingMessageIndex((i) => (i + 1) % SOURCING_MESSAGES.length), SOURCING_MESSAGE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [searching]);

  async function search(forceRefresh: boolean) {
    if (!material.trim()) return;
    setSearching(!forceRefresh);
    setRefreshing(forceRefresh);
    setErrorMessage(null);
    setSourcingMessageIndex(0);
    setTestingRow(null);
    try {
      const outcome = await runSupplierSearch(material.trim(), spec, forceRefresh, researchId);
      setResearch(outcome.research);
      setCached(outcome.cached);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
      setRefreshing(false);
    }
  }

  const suppliers = research?.result.suppliers ?? [];
  const geographies = [...new Set(suppliers.map((s) => s.geography))].sort();

  let visibleSuppliers = suppliers.filter((s) => (evidenceFilter === 'all' ? true : s.evidenceQuality === evidenceFilter));
  if (geographyFilter) visibleSuppliers = visibleSuppliers.filter((s) => s.geography === geographyFilter);
  if (sortKey === 'price') {
    visibleSuppliers = [...visibleSuppliers].sort((a, b) => (a.normalizedAedPerKg ?? Infinity) - (b.normalizedAedPerKg ?? Infinity));
  } else if (sortKey === 'leadTime') {
    visibleSuppliers = [...visibleSuppliers].sort((a, b) => leadTimeSortValue(a.leadTime) - leadTimeSortValue(b.leadTime));
  } else if (sortKey === 'evidence') {
    visibleSuppliers = [...visibleSuppliers].sort((a, b) => EVIDENCE_RANK[a.evidenceQuality] - EVIDENCE_RANK[b.evidenceQuality]);
  }

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-2">
          <BuildingIcon className="text-text-tertiary" />
          <p className="font-sans text-sm font-semibold text-text-primary">Supplier Alternatives</p>
        </div>
        <button type="button" onClick={onBack} className="font-sans text-xs font-medium text-accent-blue hover:underline">
          ← Back to Understand
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="font-sans text-xs font-medium text-text-secondary">Affected material</p>
          <p className="mt-1 font-sans text-xs text-text-tertiary">Confirmed from the research above — change it if it isn't quite right before searching.</p>
          <input
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="mt-2 w-full max-w-sm rounded-lg border border-border-subtle bg-bg-primary px-3 py-2.5 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => search(false)}
            disabled={searching || !material.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <SparkleIcon width={14} height={14} />
            {searching ? 'Sourcing…' : research ? 'Search Again' : 'Find Suppliers'}
          </button>
        </div>
      </div>

      <button type="button" onClick={() => setShowSpecForm((v) => !v)} className="mt-3 font-sans text-xs font-medium text-accent-blue hover:underline">
        {showSpecForm ? 'Hide' : 'Add'} optional procurement details
      </button>
      {showSpecForm && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-bg-panel-raised p-4 sm:grid-cols-2 lg:grid-cols-3">
          {SPEC_FIELDS.map((f) => (
            <div key={f.key}>
              <p className="font-sans text-xs font-medium text-text-secondary">{f.label}</p>
              <input
                type="text"
                value={spec[f.key] ?? ''}
                onChange={(e) => setSpec((s) => ({ ...s, [f.key]: e.target.value || null }))}
                placeholder={f.placeholder}
                className="mt-1.5 w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {searching && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-3">
          <div className="flex items-center gap-1" aria-hidden="true">
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent-blue [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent-blue [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-accent-blue" />
          </div>
          <p className="font-sans text-sm text-text-primary">{SOURCING_MESSAGES[sourcingMessageIndex]} This can take up to a minute…</p>
        </div>
      )}

      {errorMessage && <p className="mt-4 font-sans text-sm text-accent-red">{errorMessage}</p>}

      {research && !searching && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <DataSourceBadge source={research.sourcesRetrieved ? 'live-research' : 'uncited-commentary'} />
              <span className="font-mono text-xs text-text-tertiary">{cached ? `Researched ${relativeTime(research.createdAt)}` : 'Just researched'}</span>
              <button type="button" onClick={() => search(true)} disabled={refreshing} className="flex items-center gap-1 font-sans text-xs font-medium text-accent-blue hover:underline disabled:opacity-50">
                <RefreshIcon width={12} height={12} />
                {refreshing ? 'Refreshing…' : 'Refresh Supplier Research'}
              </button>
            </div>
            <p className="font-sans text-xs text-text-tertiary">
              {suppliers.length} supplier{suppliers.length === 1 ? '' : 's'} found
            </p>
          </div>

          <p className="mt-3 font-sans text-sm text-text-secondary">{research.result.summary}</p>

          {suppliers.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-bg-panel-raised p-3">
              <div className="flex items-center gap-1.5">
                <ShieldIcon width={13} height={13} className="text-text-tertiary" />
                <select
                  value={evidenceFilter}
                  onChange={(e) => setEvidenceFilter(e.target.value as EvidenceFilter)}
                  className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1 font-sans text-xs text-text-primary focus:border-accent-blue/60 focus:outline-none"
                >
                  <option value="all">All evidence levels</option>
                  <option value="high">High evidence</option>
                  <option value="medium">Medium evidence</option>
                  <option value="limited">Limited evidence</option>
                </select>
              </div>
              {geographies.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <PinIcon width={13} height={13} className="text-text-tertiary" />
                  <select
                    value={geographyFilter}
                    onChange={(e) => setGeographyFilter(e.target.value)}
                    className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1 font-sans text-xs text-text-primary focus:border-accent-blue/60 focus:outline-none"
                  >
                    <option value="">All geographies</option>
                    {geographies.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <ChevronDownIcon width={13} height={13} className="text-text-tertiary" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="rounded-md border border-border-subtle bg-bg-panel px-2 py-1 font-sans text-xs text-text-primary focus:border-accent-blue/60 focus:outline-none"
                >
                  <option value="none">Default order</option>
                  <option value="price">Sort: Lowest indicative price</option>
                  <option value="leadTime">Sort: Shortest lead time</option>
                  <option value="evidence">Sort: Best evidence first</option>
                </select>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visibleSuppliers.map((row) => (
              <SupplierCard key={`${row.name}-${row.product}`} row={row} onTest={optimizerResource ? () => setTestingRow(row) : undefined} />
            ))}
          </div>

          {testingRow && optimizerResource && (
            <SupplierScenarioTest material={material} resource={optimizerResource} row={testingRow} onClose={() => setTestingRow(null)} />
          )}

          {suppliers.length === 0 && (
            <p className="mt-4 rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-3 py-2 font-sans text-sm text-accent-orange">
              No suppliers with verifiable evidence were found for this material and spec. Try broadening the geography, or removing optional details, and search again.
            </p>
          )}
          {suppliers.length > 0 && visibleSuppliers.length === 0 && (
            <p className="mt-4 font-sans text-sm text-text-tertiary">No suppliers match the current filters.</p>
          )}

          <p className="mt-5 flex items-center gap-1.5 border-t border-border-subtle pt-3 font-mono text-[11px] text-text-tertiary">
            <FileIcon width={12} height={12} />
            {research.result.disclaimer}
          </p>
        </>
      )}

      {!research && !searching && (
        <p className="mt-6 flex items-center gap-1.5 font-sans text-sm text-text-tertiary">
          <CalendarIcon width={14} height={14} />
          No supplier search has been run yet for this material.
        </p>
      )}
    </section>
  );
}
