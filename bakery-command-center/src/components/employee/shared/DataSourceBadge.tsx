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
 * "Do not make mock figures appear as confirmed Grandiose operational data" (§26).
 * Everything in this build is seeded placeholder history, so this defaults to
 * 'illustrative' everywhere it's used — the prop exists so a future real-data
 * source can flip it per-screen without a redesign.
 */
export function DataSourceBadge({ source = 'illustrative' }: { source?: DataSource }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${CLASS[source]}`}>{LABEL[source]}</span>
  );
}
