import { useState, type RefObject } from 'react';
import { exportChartToPng, type ChartExportLegendItem } from '../../lib/svgExport';

function DownloadIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-chart-export-icon="true"
    >
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

interface ChartExportButtonProps {
  containerRef: RefObject<HTMLElement | null>;
  title: string;
  filterContext?: string;
  legend?: ChartExportLegendItem[];
  sourceLabel?: string;
}

/**
 * Small, subtle icon-only button — one per chart, not a dropdown (there's
 * only one export format: PNG). Placed in each chart section's own header
 * row, next to its title, matching the sizing of the app's other small
 * icon-only affordances.
 */
export function ChartExportButton({ containerRef, title, filterContext, legend, sourceLabel }: ChartExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!containerRef.current) return;
    setBusy(true);
    setError(null);
    try {
      await exportChartToPng(containerRef.current, { title, filterContext, legend, sourceLabel });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Download chart as PNG"
        aria-label="Download chart as PNG"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle text-text-tertiary transition-colors hover:border-accent-blue/50 hover:text-accent-blue disabled:opacity-50"
      >
        <DownloadIcon />
      </button>
      {error && (
        <p className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-accent-red/40 bg-bg-panel px-2.5 py-1.5 font-sans text-[11px] text-accent-red shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
