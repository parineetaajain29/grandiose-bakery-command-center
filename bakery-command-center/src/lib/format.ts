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
