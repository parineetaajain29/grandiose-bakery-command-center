import type { PerformanceTrackerData } from '../../data/types';
import { Sparkline } from './Sparkline';

interface PerformanceTrackerKpiStripProps {
  data: PerformanceTrackerData;
}

const TONE_CLASS: Record<'up-bad' | 'down-good' | 'flat', string> = {
  'up-bad': 'text-accent-red',
  'down-good': 'text-accent-green',
  flat: 'text-text-secondary',
};

const TONE_COLOR_VAR: Record<'up-bad' | 'down-good' | 'flat', string> = {
  'up-bad': 'var(--accent-red)',
  'down-good': 'var(--accent-green)',
  flat: 'var(--accent-blue)',
};

const TREND_FOR_KEY: Record<string, keyof PerformanceTrackerData> = {
  foodCostPct: 'foodCostTrend',
  wastagePct: 'wastageTrend',
  grossMarginPct: 'marginTrend',
  costPerUnit: 'costUnitTrend',
};

/** Streamlit: baseline['food_cost_pct']/['wastage_pct'] as "31.4%"; cost_per_unit as "3.85" (2dp, no % — label already says "(AED)"), gross margin as "42.1%". */
function formatKpiValue(key: string, value: number): string {
  if (key === 'costPerUnit') return value.toFixed(2);
  return `${value}%`;
}

/**
 * The stored `badge` caption was ported verbatim from the Streamlit source
 * and had gone stale for two of the four cards — confirmed via the
 * product-flow audit (2026-09): food cost claimed "1.2pt vs target" against
 * an actual gap of 1.4pt (baseline.foodCostPct - targetFoodCostPct), and
 * wastage claimed "0.3pt vs last month" against an actual last-two-month
 * delta of 0.1pt. Recomputing these two directly from the same underlying
 * numbers the card already displays — rather than just correcting the two
 * literal strings — so this can't go stale again the same way. Margin's
 * "flat" and cost/unit's "vs std 3.60" were checked and are not numeric
 * claims that can drift the same way, so they still read the stored badge.
 */
function badgeText(card: PerformanceTrackerData['kpiCards'][number], data: PerformanceTrackerData): string {
  if (card.key === 'foodCostPct') {
    const delta = data.baseline.foodCostPct - data.targetFoodCostPct;
    const arrow = delta > 0 ? '↑ ' : delta < 0 ? '↓ ' : '';
    return `${arrow}${Math.abs(delta).toFixed(1)}pt vs target`;
  }
  if (card.key === 'wastagePct') {
    const trend = data.wastageTrend;
    const delta = trend[trend.length - 1] - trend[trend.length - 2];
    const arrow = delta > 0 ? '↑ ' : delta < 0 ? '↓ ' : '';
    return `${arrow}${Math.abs(delta).toFixed(1)}pt vs last month`;
  }
  return card.badge;
}

export function PerformanceTrackerKpiStrip({ data }: PerformanceTrackerKpiStripProps) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle shadow-card sm:grid-cols-2 lg:grid-cols-4">
      {data.kpiCards.map((card) => {
        const value = data.baseline[card.key];
        const trend = data[TREND_FOR_KEY[card.key]] as number[];
        return (
          <div key={card.key} className="bg-bg-panel p-5">
            <p className="font-sans text-xs font-medium text-text-tertiary">{card.label}</p>
            <p className="mt-3 font-sans font-tabular text-2xl font-semibold text-text-primary sm:text-[28px]">{formatKpiValue(card.key, value)}</p>
            <p className={`mt-1.5 font-sans text-xs font-medium ${TONE_CLASS[card.tone]}`}>{badgeText(card, data)}</p>
            <div className="mt-2">
              <Sparkline data={trend} color={TONE_COLOR_VAR[card.tone]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
