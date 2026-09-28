type DataSource = 'illustrative' | 'local' | 'gm-confirmed' | 'live-research' | 'user-entered' | 'uncited-commentary';

const LABEL: Record<DataSource, string> = {
  illustrative: 'Illustrative / Demo',
  local: 'Local Data',
  'gm-confirmed': 'GM Confirmed',
  'live-research': 'External Research — Live',
  'user-entered': 'Your Custom Data',
  // Exact same wording RiskConfidenceGauge already uses for this same case
  // (research.sourcesRetrieved === false) so the badge and the gauges below
  // it on AI Risk Intelligence's Understand stage never contradict each other.
  'uncited-commentary': 'Uncited Model Commentary',
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
  // Neutral, not green/orange: this is real user-typed input for this run
  // only (Optimization Lab's custom-data mode) — neither a known-demo figure
  // nor a GM-confirmed one, so neither existing tone would be honest here.
  'user-entered': 'border-border-subtle text-text-secondary',
  // Same orange tone as 'illustrative' — a research run where the web search
  // found no sources is not verified external data either, so it gets the
  // same "treat this cautiously" color as demo figures.
  'uncited-commentary': 'border-accent-orange/40 text-accent-orange',
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
    <span className={`rounded-full border px-2.5 py-0.5 font-sans text-[11px] font-medium ${CLASS[source]}`}>{LABEL[source]}</span>
  );
}
