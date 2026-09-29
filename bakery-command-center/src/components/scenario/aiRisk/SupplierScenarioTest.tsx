import { useState } from 'react';
import { runOptimization, type OptimizationResourceName, type OptimizationResult } from '../../../data/api';
import type { SupplierRow } from '../../../data/api';
import { DataSourceBadge } from '../../shared/DataSourceBadge';
import { DEMO_RESOURCE_LIMITS, buildSupplierScenario, type OptimizerMappedResource } from './supplierOptimizationScenario';
import { BarChartIcon, CheckCircleIcon, RefreshIcon } from './icons';

const RESOURCE_LABEL: Record<OptimizerMappedResource, string> = { flour_kg: 'Flour', butter_kg: 'Butter' };

function round2(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div>
      <p className="font-sans text-xs font-medium text-text-secondary">{label}</p>
      <div className="relative mt-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 font-sans text-sm text-text-primary focus:border-accent-blue/60 focus:outline-none"
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-sans text-xs text-text-tertiary">{suffix}</span>}
      </div>
    </div>
  );
}

function ResultColumn({ title, result, resource }: { title: string; result: OptimizationResult | null; resource: OptimizationResourceName }) {
  if (!result) {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-bg-panel p-4">
        <p className="font-sans text-sm font-semibold text-text-primary">{title}</p>
        <p className="font-sans text-sm text-text-tertiary">—</p>
      </div>
    );
  }
  if (result.status === 'infeasible') {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-accent-orange/40 bg-accent-orange/10 p-4">
        <p className="font-sans text-sm font-semibold text-text-primary">{title}</p>
        <p className="font-sans text-sm text-accent-orange">No feasible plan: {result.message}</p>
      </div>
    );
  }
  const resourceRow = result.resources.find((r) => r.name === resource);
  const binding = result.binding_constraints.includes(resource);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-bg-panel p-4">
      <p className="font-sans text-sm font-semibold text-text-primary">{title}</p>
      <div>
        <p className="font-sans text-[11px] text-text-tertiary">Optimized contribution</p>
        <p className="font-mono text-lg font-semibold text-text-primary">AED {round2(result.optimized_contribution)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="font-sans text-[11px] text-text-tertiary">Material cost</p>
          <p className="font-mono text-sm text-text-primary">AED {round2(result.optimized_variable_cost)}</p>
        </div>
        <div>
          <p className="font-sans text-[11px] text-text-tertiary">{RESOURCE_LABEL[resource as OptimizerMappedResource] ?? resource} utilization</p>
          <p className="font-mono text-sm text-text-primary">{resourceRow ? `${round2(resourceRow.utilization_percentage)}%` : '—'}</p>
        </div>
      </div>
      {resourceRow && (
        <p className="font-sans text-xs text-text-tertiary">
          {round2(resourceRow.used)} / {round2(resourceRow.available)} kg used
          {binding && <span className="ml-1 font-medium text-accent-orange">— binding constraint</span>}
        </p>
      )}
      <div>
        <p className="font-sans text-[11px] text-text-tertiary">Production mix (optimized vs current)</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {result.sku_changes.map((c) => (
            <li key={c.sku} className="flex justify-between font-sans text-xs text-text-secondary">
              <span>{c.sku}</span>
              <span className="font-mono text-text-primary">
                {c.current_production} → {c.optimized_production}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface SupplierScenarioTestProps {
  material: string;
  resource: OptimizerMappedResource;
  row: SupplierRow;
  onClose: () => void;
}

/** The "Test in Optimization" review + result screen — only ever rendered
 * for butter/flour (the two real optimizer resources; see
 * supplierOptimizationScenario.ts). Per spec: web research proposes
 * assumptions, management confirms them before anything runs; nothing here
 * is saved to production data, and the AI never computes the financial
 * result — the same deterministic solver Optimization Lab already uses
 * does, exactly as-is. */
export function SupplierScenarioTest({ material, resource, row, onClose }: SupplierScenarioTestProps) {
  const [additionalAvailability, setAdditionalAvailability] = useState('');
  const [currentCostPerKg, setCurrentCostPerKg] = useState('');
  const [supplierCostPerKg, setSupplierCostPerKg] = useState(row.normalizedAedPerKg !== null ? String(row.normalizedAedPerKg) : '');
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<OptimizationResult | null>(null);
  const [scenarioResult, setScenarioResult] = useState<OptimizationResult | null>(null);

  const currentAvailability = DEMO_RESOURCE_LIMITS[resource];
  const additionalNum = Number(additionalAvailability);
  const currentCostNum = Number(currentCostPerKg);
  const supplierCostNum = Number(supplierCostPerKg);
  const scenarioAvailability = Number.isFinite(additionalNum) ? currentAvailability + additionalNum : currentAvailability;
  const canRun = additionalAvailability !== '' && currentCostPerKg !== '' && supplierCostPerKg !== '' && Number.isFinite(additionalNum) && Number.isFinite(currentCostNum) && Number.isFinite(supplierCostNum);

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setErrorMessage(null);
    setBaseline(null);
    setScenarioResult(null);
    try {
      const scenario = buildSupplierScenario({ resource, additionalAvailabilityKg: additionalNum, currentCostPerKg: currentCostNum, supplierCostPerKg: supplierCostNum });
      const [b, s] = await Promise.all([runOptimization(), runOptimization({ scenario })]);
      setBaseline(b);
      setScenarioResult(s);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 rounded-card border border-accent-blue/40 bg-bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <BarChartIcon className="text-accent-blue" />
          <p className="font-sans text-sm font-semibold text-text-primary">Test Supplier Scenario — {row.name}</p>
        </div>
        <button type="button" onClick={onClose} className="font-sans text-xs font-medium text-text-tertiary hover:text-text-primary">
          Close
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <DataSourceBadge source="illustrative" />
        <p className="font-sans text-xs text-text-tertiary">
          Runs against the same illustrative baseline as Optimization Lab. Nothing here is saved to production data — this is a temporary test scenario only.
        </p>
      </div>

      <p className="mt-3 font-sans text-xs text-text-secondary">
        Web research proposed the figures below where it could — confirm or change every value before running. Material: <strong className="text-text-primary">{material}</strong> → modeled as {RESOURCE_LABEL[resource]} ({resource}).
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-sans text-xs font-medium text-text-secondary">Current availability</p>
          <p className="mt-1.5 rounded-lg border border-border-subtle bg-bg-panel-raised px-3 py-2 font-mono text-sm text-text-primary">{round2(currentAvailability)} kg</p>
        </div>
        <NumberField label="Additional availability from this supplier" value={additionalAvailability} onChange={setAdditionalAvailability} suffix="kg" />
        <NumberField label="Current baseline cost" value={currentCostPerKg} onChange={setCurrentCostPerKg} suffix="AED/kg" />
        <NumberField label="Supplier indicative cost" value={supplierCostPerKg} onChange={setSupplierCostPerKg} suffix="AED/kg" />
      </div>
      <p className="mt-2 font-sans text-xs text-text-tertiary">Scenario availability: {round2(scenarioAvailability)} kg · Source: {row.name}{row.sources[0] ? ` (${row.sources[0].label})` : ''}</p>
      {supplierCostPerKg === '' && row.normalizedAedPerKg === null && (
        <p className="mt-1 font-sans text-xs text-accent-orange">No normalized price was available from this supplier's research — enter your own assumption to test.</p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={!canRun || running}
        className="mt-4 flex items-center gap-1.5 rounded-lg border border-accent-blue bg-accent-blue px-4 py-2.5 font-sans text-sm font-semibold text-[#04070d] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {running ? <RefreshIcon width={14} height={14} className="animate-spin" /> : <CheckCircleIcon width={14} height={14} />}
        {running ? 'Running…' : 'Run Optimization Test'}
      </button>

      {errorMessage && <p className="mt-3 font-sans text-sm text-accent-red">{errorMessage}</p>}

      {(baseline || scenarioResult) && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 lg:grid-cols-2">
          <ResultColumn title="Baseline (current sourcing)" result={baseline} resource={resource} />
          <ResultColumn title="Supplier Scenario" result={scenarioResult} resource={resource} />
        </div>
      )}
    </div>
  );
}
