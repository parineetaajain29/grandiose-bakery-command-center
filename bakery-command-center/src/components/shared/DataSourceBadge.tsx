type DataSource = 'illustrative' | 'local' | 'gm-confirmed';

const LABEL: Record<DataSource, string> = {
  illustrative: 'Illustrative / Demo',
  local: 'Local Data',
  'gm-confirmed': 'GM Confirmed',
};

const CLASS: Record<DataSource, string> = {
  illustrative: 'border-accent-orange/40 text-accent-orange',
  local: 'border-border-subtle text-text-secondary',
  'gm-confirmed': 'border-accent-green/40 text-accent-green',
};

/**
 * App-wide data-provenance badge — originally Employee-Portal-only
 * (src/components/employee/shared/DataSourceBadge.tsx re-exports this same
 * component so that import path keeps working unchanged), now shared across
 * Command Center, Scenario & Resilience, Company Profile, SKU Performance,
 * and Data Processor. "Do not make mock figures appear as confirmed
 * Grandiose operational data" — everything in this build defaults to
 * 'illustrative' unless a screen explicitly knows better.
 */
export function DataSourceBadge({ source = 'illustrative' }: { source?: DataSource }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${CLASS[source]}`}>{LABEL[source]}</span>
  );
}
