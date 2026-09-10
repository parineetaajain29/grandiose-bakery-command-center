export type Tone = 'green' | 'amber' | 'red';

export const TONE_TEXT_CLASS: Record<Tone, string> = {
  green: 'text-accent-green',
  amber: 'text-accent-orange',
  red: 'text-accent-red',
};

export function efficiencyTone(pct: number | null): Tone {
  if (pct === null) return 'amber';
  if (pct >= 85) return 'green';
  if (pct >= 70) return 'amber';
  return 'red';
}
