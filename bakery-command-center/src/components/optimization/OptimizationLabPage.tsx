import { useMemo, useRef, useState } from 'react';
import type { AuthUser } from '../../data';
import {
  runOptimization,
  type OptimizationCustomInput,
  type OptimizationInfeasibleResult,
  type OptimizationResource,
  type OptimizationResourceLimits,
  type OptimizationResourceName,
  type OptimizationResult,
  type OptimizationSkuChange,
  type OptimizationSkuInput,
} from '../../data/api';
import { formatAED, formatPercent } from '../../lib/format';
import { DataSourceBadge } from '../shared/DataSourceBadge';
import { KpiCard, KpiCardGrid } from '../employee/shared/KpiCard';
import { RAW_PRODUCTS } from '../../data/skuData';

// Real product names pulled from the app's actual SKU catalogue (110 distinct
// names, confirmed) — never a hand-typed/invented list.
const PRODUCT_NAMES = RAW_PRODUCTS.map((p) => p.product);
const OTHER_SKU_OPTION = '__other__';

const RESOURCE_LABEL: Record<OptimizationResourceName, string> = {
  labour_minutes: 'Labour',
  oven_minutes: 'Oven',
  flour_kg: 'Flour',
  butter_kg: 'Butter',
};

/** Resource-capacity totals (thousands of minutes/kg) read better as a plain
 * quantity than via formatMinutes/formatHoursFromMinutes, which are built for
 * short shift durations (see format.ts) — a different semantic than "how much
 * of this resource is available in total." */
function formatResourceValue(name: OptimizationResourceName, value: number): string {
  const suffix = name.endsWith('_kg') ? 'kg' : 'min';
  return `${value.toLocaleString('en-AE', { maximumFractionDigits: 2 })} ${suffix}`;
}

// Shared field styling — matches DailyLogForm.tsx / SettingsPage.tsx exactly, not a new form pattern.
const labelClass = 'font-sans text-xs font-medium text-text-tertiary';
const inputClass =
  'mt-1 w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none';

function ResourceBar({ resource }: { resource: OptimizationResource }) {
  const pct = Math.min(100, resource.utilization_percentage);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-sm font-medium text-text-primary">{RESOURCE_LABEL[resource.name]}</p>
        <div className="flex items-center gap-2">
          {resource.binding && (
            <span className="rounded-full border border-accent-orange/40 px-2 py-0.5 font-sans text-[11px] font-medium text-accent-orange">
              Binding
            </span>
          )}
          <p className="font-mono font-tabular text-xs text-text-secondary">
            {formatResourceValue(resource.name, resource.used)} / {formatResourceValue(resource.name, resource.available)} ·{' '}
            {formatPercent(resource.utilization_percentage)}
          </p>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border-subtle">
        <div className={`h-full rounded-full ${resource.binding ? 'bg-accent-orange' : 'bg-accent-blue'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SkuChangesTable({ changes }: { changes: OptimizationSkuChange[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
            <th className="py-2 pr-4 font-medium">SKU</th>
            <th className="py-2 pr-4 text-right font-medium">Current</th>
            <th className="py-2 pr-4 text-right font-medium">Optimized</th>
            <th className="py-2 pr-4 text-right font-medium">Change</th>
            <th className="py-2 pr-4 text-right font-medium">Contr. margin / unit</th>
          </tr>
        </thead>
        <tbody className="font-sans text-sm">
          {changes.map((row) => {
            const tone = row.absolute_change > 0 ? 'text-accent-green' : row.absolute_change < 0 ? 'text-accent-red' : 'text-text-secondary';
            return (
              <tr key={row.sku} className="border-b border-border-subtle/60 last:border-0">
                <td className="py-2 pr-4 text-text-primary">{row.sku}</td>
                <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">
                  {row.current_production.toLocaleString('en-AE')}
                </td>
                <td className="py-2 pr-4 text-right font-mono font-tabular text-text-primary">
                  {row.optimized_production.toLocaleString('en-AE')}
                </td>
                <td className={`py-2 pr-4 text-right font-mono font-tabular ${tone}`}>
                  {row.absolute_change > 0 ? '+' : ''}
                  {row.absolute_change.toLocaleString('en-AE')}
                  {row.percentage_change !== null &&
                    ` (${row.percentage_change > 0 ? '+' : ''}${row.percentage_change.toFixed(1)}%)`}
                </td>
                <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">
                  {formatAED(row.contribution_margin_per_unit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InfeasibleResultCard({ result }: { result: OptimizationInfeasibleResult }) {
  const names = Object.keys(result.resource_availability) as OptimizationResourceName[];
  return (
    <section className="rounded-card border border-accent-red/40 bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="font-sans text-xs font-medium text-accent-red">No feasible production plan</p>
      <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Demand minimums exceed available resources</h3>
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        The retail/B2B minimum commitments for these SKUs can&apos;t all be met with the resources available — there
        is no production quantity that satisfies every constraint. This is a normal outcome of the solve, not an
        error.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle font-sans text-xs font-medium text-text-secondary">
              <th className="py-2 pr-4 font-medium">Resource</th>
              <th className="py-2 pr-4 text-right font-medium">Required at minimums</th>
              <th className="py-2 pr-4 text-right font-medium">Available</th>
              <th className="py-2 pr-4 text-right font-medium">Shortfall</th>
            </tr>
          </thead>
          <tbody className="font-sans text-sm">
            {names.map((name) => (
              <tr key={name} className="border-b border-border-subtle/60 last:border-0">
                <td className="py-2 pr-4 text-text-primary">{RESOURCE_LABEL[name]}</td>
                <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">
                  {formatResourceValue(name, result.minimum_resource_requirements[name])}
                </td>
                <td className="py-2 pr-4 text-right font-mono font-tabular text-text-secondary">
                  {formatResourceValue(name, result.resource_availability[name])}
                </td>
                <td className="py-2 pr-4 text-right font-mono font-tabular text-accent-red">
                  {formatResourceValue(name, result.resource_shortfalls[name])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-sans text-xs text-text-tertiary">Solver message: {result.message}</p>
    </section>
  );
}

/** Shared between demo and custom runs — rendered once, below whichever mode's form is active. */
function ResultsSection({ result }: { result: OptimizationResult }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="font-sans text-xs font-medium text-text-tertiary">Results</p>
        <DataSourceBadge source={result.isDemoData ? 'illustrative' : 'user-entered'} />
      </div>

      {result.status === 'infeasible' && <InfeasibleResultCard result={result} />}

      {result.status === 'optimal' && (
        <>
          <KpiCardGrid>
            <KpiCard eyebrow="Current Contribution" value={formatAED(result.current_contribution)} />
            <KpiCard eyebrow="Optimized Contribution" value={formatAED(result.optimized_contribution)} valueClassName="text-accent-blue" />
            <KpiCard
              eyebrow="Contribution Improvement"
              value={`${result.contribution_improvement >= 0 ? '+' : ''}${formatAED(result.contribution_improvement)}`}
              valueClassName={result.contribution_improvement >= 0 ? 'text-accent-green' : 'text-accent-red'}
            />
            <KpiCard
              eyebrow="Improvement %"
              value={result.improvement_percentage === null ? '—' : formatPercent(result.improvement_percentage)}
              valueClassName={
                result.improvement_percentage !== null && result.improvement_percentage >= 0 ? 'text-accent-green' : 'text-accent-red'
              }
            />
          </KpiCardGrid>

          <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
            <p className="font-sans text-xs font-medium text-text-tertiary">Production Plan</p>
            <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Current vs. optimized, per SKU</h3>
            <div className="mt-4">
              <SkuChangesTable changes={result.sku_changes} />
            </div>
          </section>

          <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
            <p className="font-sans text-xs font-medium text-text-tertiary">Resources</p>
            <h3 className="mt-1.5 font-sans text-lg font-semibold text-text-primary">Utilization &amp; binding constraints</h3>
            <p className="mt-1 font-sans text-xs text-text-tertiary">
              {result.binding_constraints.length > 0
                ? `${result.binding_constraints.map((n) => RESOURCE_LABEL[n]).join(', ')} ${
                    result.binding_constraints.length > 1 ? 'are' : 'is'
                  } fully used — the reason production can't increase further.`
                : 'No resource is fully used at this solution.'}
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {result.resources.map((r) => (
                <ResourceBar key={r.name} resource={r} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function DemoDataPanel({ busy, onRun }: { busy: boolean; onRun: () => void }) {
  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="max-w-2xl text-sm text-text-secondary">
        Solves for the production quantity of each SKU that maximizes total contribution margin, subject to
        demand, retail/B2B minimums, labour, oven, flour, and butter constraints — a deterministic optimization,
        not an AI estimate.
      </p>
      <p className="mt-2 max-w-2xl font-sans text-xs text-text-tertiary">
        Grandiose&apos;s own SKU catalogue has no per-SKU cost, margin, or resource-consumption data yet (see SKU
        Performance), so this runs the engine&apos;s own illustrative 5-SKU demo dataset — Croissant, Pain au
        Chocolat, Danish, Brioche, and Cinnamon Roll — never real Grandiose production figures.
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={busy}
        className="mt-4 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Running…' : 'Run optimization'}
      </button>
    </section>
  );
}

// --- Custom data form -------------------------------------------------------

type SkuNumericField = Exclude<keyof OptimizationSkuInput, 'sku'>;

interface SkuRowFields extends Record<SkuNumericField, string> {
  id: number;
  /** '' (nothing chosen), a real product name from PRODUCT_NAMES, or OTHER_SKU_OPTION. */
  skuSelection: string;
  /** The name actually submitted/validated — mirrors skuSelection for a
   * catalog pick; holds the free-typed text only when skuSelection is
   * OTHER_SKU_OPTION. Kept separate so validateAndParse never needs to know
   * about the dropdown at all. */
  sku: string;
}

const SKU_NUMERIC_FIELDS: { key: SkuNumericField; label: string; placeholder: string }[] = [
  { key: 'selling_price', label: 'Selling Price (AED)', placeholder: 'e.g. 8.00' },
  { key: 'variable_cost', label: 'Variable Cost (AED)', placeholder: 'e.g. 3.20' },
  { key: 'current_production', label: 'Current Production', placeholder: 'e.g. 900' },
  { key: 'forecast_demand', label: 'Forecast Demand', placeholder: 'e.g. 1200' },
  { key: 'retail_minimum', label: 'Retail Minimum', placeholder: 'e.g. 500' },
  { key: 'b2b_commitment', label: 'B2B Commitment', placeholder: 'e.g. 350' },
  { key: 'labour_minutes', label: 'Labour (min / unit)', placeholder: 'e.g. 3.0' },
  { key: 'oven_minutes', label: 'Oven (min / unit)', placeholder: 'e.g. 1.8' },
  { key: 'flour_kg', label: 'Flour (kg / unit)', placeholder: 'e.g. 0.08' },
  { key: 'butter_kg', label: 'Butter (kg / unit)', placeholder: 'e.g. 0.03' },
];

const RESOURCE_FIELDS: { key: OptimizationResourceName; label: string; placeholder: string }[] = [
  { key: 'labour_minutes', label: 'Labour Available (min)', placeholder: 'e.g. 9985' },
  { key: 'oven_minutes', label: 'Oven Available (min)', placeholder: 'e.g. 6020' },
  { key: 'flour_kg', label: 'Flour Available (kg)', placeholder: 'e.g. 256.25' },
  { key: 'butter_kg', label: 'Butter Available (kg)', placeholder: 'e.g. 93.60' },
];

function blankResourceFields(): Record<OptimizationResourceName, string> {
  return { labour_minutes: '', oven_minutes: '', flour_kg: '', butter_kg: '' };
}

/** Structural checks only (required, non-negative number, unique names) —
 * cross-field business rules (e.g. minimum > demand) are deliberately left
 * to the backend's own OptimizationInputError, which is the real source of
 * truth; its message is shown verbatim on a 400. */
function validateAndParse(
  rows: SkuRowFields[],
  resourceFields: Record<OptimizationResourceName, string>,
): { errors: string[]; payload: OptimizationCustomInput | null } {
  const errors: string[] = [];

  if (rows.length === 0) {
    errors.push('Add at least one SKU before running the optimizer.');
  }

  const seenNames = new Set<string>();
  const skuData: OptimizationSkuInput[] = [];
  let allSkusValid = rows.length > 0;

  rows.forEach((row, idx) => {
    const name = row.sku.trim();
    const label = name || `Row ${idx + 1}`;
    let rowValid = true;

    if (name === '') {
      errors.push(`${label}: SKU name is required.`);
      rowValid = false;
    } else if (seenNames.has(name)) {
      errors.push(`Duplicate SKU name: "${name}".`);
      rowValid = false;
    } else {
      seenNames.add(name);
    }

    const values: Partial<Record<SkuNumericField, number>> = {};
    for (const field of SKU_NUMERIC_FIELDS) {
      const raw = row[field.key];
      // Checked as an explicit empty-string case (never `Number(raw) < 0`)
      // so an untouched field is caught as "required," not silently
      // coerced to 0 — Number('') === 0 would otherwise hide the omission.
      if (raw.trim() === '') {
        errors.push(`${label}: ${field.label} is required.`);
        rowValid = false;
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        errors.push(`${label}: ${field.label} must be a non-negative number.`);
        rowValid = false;
        continue;
      }
      values[field.key] = num;
    }

    if (rowValid) {
      // Safe: rowValid is only true once every SKU_NUMERIC_FIELDS key above
      // has been assigned a validated number into `values`.
      skuData.push({ sku: name, ...values } as OptimizationSkuInput);
    } else {
      allSkusValid = false;
    }
  });

  const resourceLimits: Partial<OptimizationResourceLimits> = {};
  let resourcesValid = true;
  for (const field of RESOURCE_FIELDS) {
    const raw = resourceFields[field.key];
    if (raw.trim() === '') {
      errors.push(`${field.label} is required.`);
      resourcesValid = false;
      continue;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      errors.push(`${field.label} must be a non-negative number.`);
      resourcesValid = false;
      continue;
    }
    resourceLimits[field.key] = num;
  }

  if (!allSkusValid || !resourcesValid || errors.length > 0) {
    return { errors, payload: null };
  }
  return { errors: [], payload: { sku_data: skuData, resource_limits: resourceLimits as OptimizationResourceLimits } };
}

function blankSkuFields(): Omit<SkuRowFields, 'id'> {
  return {
    skuSelection: '',
    sku: '',
    selling_price: '',
    variable_cost: '',
    current_production: '',
    forecast_demand: '',
    retail_minimum: '',
    b2b_commitment: '',
    labour_minutes: '',
    oven_minutes: '',
    flour_kg: '',
    butter_kg: '',
  };
}

function CustomDataForm({ busy, onRun }: { busy: boolean; onRun: (input: OptimizationCustomInput) => void }) {
  // Row ids only need to be unique within this form instance — 0 is reserved
  // for the starting row so the lazy useState initializer below never has to
  // touch the ref (React refs must not be read/written during render).
  const nextRowId = useRef(1);

  // Starts with exactly one blank row — visible field layout on first view, nothing pre-filled from the demo dataset.
  const [rows, setRows] = useState<SkuRowFields[]>(() => [{ id: 0, ...blankSkuFields() }]);
  const [resourceFields, setResourceFields] = useState<Record<OptimizationResourceName, string>>(blankResourceFields);
  const [touched, setTouched] = useState(false);

  const { errors, payload } = useMemo(() => validateAndParse(rows, resourceFields), [rows, resourceFields]);

  function addRow() {
    setRows((r) => [...r, { id: nextRowId.current++, ...blankSkuFields() }]);
    setTouched(true);
  }
  function removeRow(id: number) {
    setRows((r) => r.filter((row) => row.id !== id));
    setTouched(true);
  }
  function setRowField(id: number, key: keyof SkuRowFields, value: string) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
    setTouched(true);
  }
  /** Dropdown change only — a catalog pick sets `sku` to match directly;
   * choosing "Other" clears `sku` to a blank slate rather than leaving
   * whatever custom text was there from a previous "Other" selection. */
  function setRowSkuSelection(id: number, selection: string) {
    setRows((r) =>
      r.map((row) =>
        row.id === id ? { ...row, skuSelection: selection, sku: selection === OTHER_SKU_OPTION ? '' : selection } : row,
      ),
    );
    setTouched(true);
  }
  function setResourceField(key: OptimizationResourceName, value: string) {
    setResourceFields((f) => ({ ...f, [key]: value }));
    setTouched(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!payload) return;
    onRun(payload);
  }

  return (
    <section className="rounded-card border border-border-subtle bg-bg-panel p-5 shadow-card sm:p-7">
      <p className="max-w-2xl text-sm text-text-secondary">
        Enter your own SKUs and resource limits below — the same deterministic solve runs against your numbers
        instead of the demo dataset.
      </p>
      <p className="mt-2 font-sans text-xs text-text-tertiary">
        Used only for this run and not saved anywhere — re-enter your figures each time you come back to this page.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-lg border border-border-subtle p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="w-full max-w-xs">
                  <label className={labelClass} htmlFor={`sku-name-${row.id}`}>
                    SKU Name
                  </label>
                  <select
                    id={`sku-name-${row.id}`}
                    value={row.skuSelection}
                    onChange={(e) => setRowSkuSelection(row.id, e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled hidden>
                      Select a product…
                    </option>
                    {PRODUCT_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={OTHER_SKU_OPTION}>Other (type your own)</option>
                  </select>
                  {row.skuSelection === OTHER_SKU_OPTION && (
                    <input
                      type="text"
                      value={row.sku}
                      placeholder="e.g. Seasonal Special"
                      onChange={(e) => setRowField(row.id, 'sku', e.target.value)}
                      className={`${inputClass} mt-2`}
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="mt-1 shrink-0 font-sans text-xs font-medium text-accent-red hover:underline"
                >
                  Remove SKU {idx + 1}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {SKU_NUMERIC_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className={labelClass} htmlFor={`${field.key}-${row.id}`}>
                      {field.label}
                    </label>
                    <input
                      id={`${field.key}-${row.id}`}
                      type="number"
                      min={0}
                      step="any"
                      value={row[field.key]}
                      placeholder={field.placeholder}
                      onChange={(e) => setRowField(row.id, field.key, e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="self-start rounded-lg border border-border-subtle px-4 py-2 font-sans text-xs font-medium text-text-primary transition-colors hover:border-accent-blue/50"
        >
          + Add SKU
        </button>

        <div>
          <p className={labelClass}>Resource Limits</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RESOURCE_FIELDS.map((field) => (
              <div key={field.key}>
                <label className={labelClass} htmlFor={`resource-${field.key}`}>
                  {field.label}
                </label>
                <input
                  id={`resource-${field.key}`}
                  type="number"
                  min={0}
                  step="any"
                  value={resourceFields[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => setResourceField(field.key, e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        {touched && errors.length > 0 && (
          <div className="flex flex-col gap-1">
            {errors.map((err) => (
              <p key={err} className="font-sans text-xs text-accent-red">
                {err}
              </p>
            ))}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Running…' : 'Run optimization'}
        </button>
      </form>
    </section>
  );
}

// --- Page --------------------------------------------------------------------

type Mode = 'demo' | 'custom';

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const TABS: { key: Mode; label: string }[] = [
    { key: 'demo', label: 'Demo dataset' },
    { key: 'custom', label: 'Your own data' },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Optimization data source">
      {TABS.map((tab) => {
        const isActive = tab.key === mode;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`rounded-full border px-4 py-2 font-sans text-xs font-medium transition-colors ${
              isActive
                ? 'border-accent-blue bg-accent-blue text-[#04070d]'
                : 'border-border-subtle bg-bg-panel text-text-secondary hover:border-accent-blue/50 hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function Workspace() {
  const [mode, setMode] = useState<Mode>('demo');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(input?: OptimizationCustomInput) {
    setBusy(true);
    setError(null);
    try {
      const r = await runOptimization(input);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-sans text-xs font-medium text-text-tertiary">Optimization Lab</p>
        <h1 className="mt-1.5 font-sans text-xl font-semibold text-text-primary sm:text-2xl">Production mix optimizer</h1>
      </div>

      <ModeTabs mode={mode} onChange={setMode} />

      {mode === 'demo' && <DemoDataPanel busy={busy} onRun={() => run()} />}
      {mode === 'custom' && <CustomDataForm busy={busy} onRun={(input) => run(input)} />}

      {error && (
        <section className="rounded-card border border-accent-red/40 bg-bg-panel p-5 shadow-card sm:p-7">
          <p className="font-sans text-sm text-accent-red">Optimization failed</p>
          <p className="mt-1.5 text-sm text-text-secondary">{error}</p>
        </section>
      )}

      {result && <ResultsSection result={result} />}

      <p className="font-sans text-xs text-text-tertiary">
        Deterministic mathematical optimization (mixed-integer linear program) — no AI/LLM computes or overrides
        these figures. Bakery division only; catering excluded.
      </p>
    </div>
  );
}

interface OptimizationLabPageProps {
  user: AuthUser;
}

/**
 * Same defence-in-depth role check as DataProcessorPage/SettingsPage — the
 * server (server/routes/optimization.ts) enforces manager/hr_admin already;
 * this only matches that pattern for a consistent nav/page experience.
 */
export function OptimizationLabPage({ user }: OptimizationLabPageProps) {
  if (user.role !== 'manager' && user.role !== 'hr_admin') {
    return (
      <section className="rounded-card border border-border-subtle bg-bg-panel p-8 text-center">
        <p className="font-sans text-sm text-text-secondary">Optimization Lab is management only.</p>
      </section>
    );
  }
  return <Workspace />;
}
