type DataSource = 'illustrative' | 'local' | 'gm-confirmed' | 'live-research';

const LABEL: Record<DataSource, string> = {
  illustrative: 'Illustrative / Demo',
  local: 'Local Data',
  'gm-confirmed': 'GM Confirmed',
  'live-research': 'External Research — Live',
};

const CLASS: Record<DataSource, string> = {
  illustrative: 'border-accent-orange/40 text-accent-orange',
  local: 'border-border-subtle text-text-secondary',
  'gm-confirmed': 'border-accent-green/40 text-accent-green',
  // Deliberately the app's primary accent, not illustrative's orange — this
  // badge marks retrieved, sourced, timestamped web research (AI Risk
  // Intelligence), never Grandiose's own placeholder/demo figures. Per Rule 5:
  // attach this only to the external-research portion of a page, never as a
  // page-level badge, and never blend it with an 'illustrative' badge on the
  // same element.
  'live-research': 'border-accent-blue/40 text-accent-blue',
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
