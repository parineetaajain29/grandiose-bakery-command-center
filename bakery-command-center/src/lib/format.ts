export function formatAED(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `AED ${(value / 1_000).toFixed(0)}K`;
  }
  return `AED ${value.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDelta(delta: number | undefined, digits = 1): string | null {
  if (delta === undefined) return null;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(digits)}%`;
}

export function deltaTone(delta: number | undefined, invert = false): 'green' | 'red' | 'neutral' {
  if (delta === undefined || delta === 0) return 'neutral';
  const positive = invert ? delta < 0 : delta > 0;
  return positive ? 'green' : 'red';
}

// --- Labour economics formatting — brief §A5. Never let a raw float reach the
// DOM; these are the only place rounding happens. `null` (never Infinity/NaN)
// always renders as an em dash.

const aedFormatter = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Currency, 2 decimals, thousands separator: "AED 4,200.00". */
export function formatCurrencyPrecise(value: number | null): string {
  if (value === null) return '—';
  return aedFormatter.format(value);
}

/** Hours, 2 decimals: "165.40". */
export function formatHours(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(2);
}

/** Percentage, 1 decimal: "71.6%". */
export function formatPercentPrecise(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

/** Ratio, 2 decimals with a trailing ×: "6.23×". */
export function formatRatio(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(2)}×`;
}

/** Short durations (changeover/downtime/idle/break): "18 min", or "1h 05m" once over an hour. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const rounded = Math.round(minutes * 10) / 10;
  if (Math.abs(rounded) < 60) return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} min`;
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
}

/** Longer durations (paid/available/productive), expressed in hours: minutes/60 formatted to 2 decimals. */
export function formatHoursFromMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  return formatHours(minutes / 60);
}
