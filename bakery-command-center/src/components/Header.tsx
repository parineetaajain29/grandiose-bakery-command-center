import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import type { AuthUser } from '../data';

interface HeaderProps {
  subtitle: string;
  dateLabel: string;
  user: AuthUser;
  onLogout: () => void;
}

export function Header({ subtitle, dateLabel, user, onLogout }: HeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <header className="border-b border-border-subtle">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-8 sm:px-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Grandiose Supermarket · Bakery Division
            </p>
            <h1 className="mt-2 font-sans text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              Bakery Command Center
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAboutOpen((v) => !v)}
                className="rounded-lg border border-border-subtle bg-bg-panel px-4 py-2 font-sans text-sm font-medium text-text-secondary transition-colors hover:border-accent-blue/60 hover:text-text-primary"
              >
                About this dashboard
              </button>
              {aboutOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-card border border-border-subtle bg-bg-panel p-4 shadow-card">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wide text-text-tertiary">About</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-primary">
                    A visual command center for Grandiose Supermarket's Bakery Division, cloned from a reference
                    finance-SaaS dashboard and retargeted to bakery production, cost, and procurement metrics.
                    All figures shown are placeholder data — see <code className="font-mono text-xs">scenarios.json</code>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAboutOpen(false)}
                    className="mt-3 font-sans text-xs font-medium text-accent-blue hover:underline"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="font-sans text-sm text-text-secondary">
            {user.name} · {user.id} · {user.role === 'hr_admin' ? 'HR / Admin' : user.role[0].toUpperCase() + user.role.slice(1)}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-border-subtle px-4 py-2 font-sans text-sm font-medium text-text-secondary transition-colors hover:border-accent-red/50 hover:text-accent-red"
          >
            Log out
          </button>
        </div>

        <div className="max-w-3xl">
          <p className="text-sm leading-relaxed text-text-secondary sm:text-base">{subtitle}</p>
          <p className="mt-2 font-sans text-xs text-text-tertiary">
            {dateLabel} · 112 bakery staff (target: 200) · figures confirmed by division finance
          </p>
        </div>
      </div>
    </header>
  );
}
