import type { ReactNode } from 'react';

interface KpiCardProps {
  eyebrow: string;
  value: string;
  caption?: string;
  valueClassName?: string;
}

/** Matches the existing dashboard's KpiStrip card visual exactly (src/components/KpiStrip.tsx). */
export function KpiCard({ eyebrow, value, caption, valueClassName }: KpiCardProps) {
  return (
    <div className="bg-bg-panel p-5">
      <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">{eyebrow}</p>
      <p className={`mt-3 font-sans font-tabular text-2xl font-semibold sm:text-[28px] ${valueClassName ?? 'text-text-primary'}`}>{value}</p>
      {caption && <p className="mt-2 font-mono text-xs text-text-secondary">{caption}</p>}
    </div>
  );
}

export function KpiCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}
