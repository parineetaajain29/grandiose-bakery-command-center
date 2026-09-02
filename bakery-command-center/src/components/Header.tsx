import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  subtitle: string;
  dateLabel: string;
}

export function Header({ subtitle, dateLabel }: HeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <header className="border-b border-border-subtle">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-8 sm:px-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-text-secondary">
              GRANDIOSE SUPERMARKET · BAKERY DIVISION
            </p>
            <h1 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              Bakery Command Center
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAboutOpen((v) => !v)}
                className="rounded-full border border-border-subtle bg-bg-panel px-4 py-2 font-mono text-xs tracking-wide text-text-secondary transition-colors hover:border-accent-blue/60 hover:text-text-primary"
              >
                About this dashboard
              </button>
              {aboutOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-border-subtle bg-bg-panel p-4 shadow-xl">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">About</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-primary">
                    A visual command center for Grandiose Supermarket's Bakery Division, cloned from a reference
                    finance-SaaS dashboard and retargeted to bakery production, cost, and procurement metrics.
                    All figures shown are placeholder data — see <code className="font-mono text-xs">scenarios.json</code>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAboutOpen(false)}
                    className="mt-3 font-mono text-[11px] tracking-wide text-accent-blue hover:underline"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="max-w-3xl">
          <p className="text-sm leading-relaxed text-text-secondary sm:text-base">{subtitle}</p>
          <p className="mt-2 font-mono text-xs tracking-wide text-text-secondary">
            {dateLabel} · 112 bakery staff (target: 200) · figures confirmed by division finance
          </p>
        </div>
      </div>
    </header>
  );
}
