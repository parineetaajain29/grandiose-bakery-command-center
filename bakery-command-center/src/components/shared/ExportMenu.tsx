import { useState } from 'react';

export interface ExportOption {
  label: string;
  onExport: () => Promise<void>;
}

interface ExportMenuProps {
  label?: string;
  options: ExportOption[];
}

/** Shared dropdown for every page's export button — same rounded-lg/
 * border-border-subtle button treatment already used across the app, no new
 * visual pattern. Each page passes in whichever formats make sense for its
 * content (prose -> Word/PDF, tabular -> CSV/Excel, both if the page has both). */
export function ExportMenu({ label = 'Export', options }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(option: ExportOption) {
    setBusy(option.label);
    setError(null);
    try {
      await option.onExport();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3.5 py-2 font-sans text-xs font-medium text-text-primary transition-colors hover:border-accent-blue/50"
      >
        {label}
        <span className="text-text-tertiary">▾</span>
      </button>

      {open && (
        <>
          {/* Click-outside catcher — no visual, just closes the menu. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 min-w-[170px] overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-card">
            {options.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => handleClick(option)}
                disabled={busy !== null}
                className="block w-full px-3.5 py-2.5 text-left font-sans text-xs text-text-primary transition-colors hover:bg-bg-panel-raised disabled:opacity-50"
              >
                {busy === option.label ? 'Preparing…' : option.label}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <p className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-accent-red/40 bg-bg-panel px-2.5 py-1.5 font-sans text-[11px] text-accent-red shadow-card">
          {error}
        </p>
      )}
    </div>
  );
}
