import type { Kpis, PeriodGranularity } from '../data';
import { deltaTone, formatAED, formatDelta, formatPercent } from '../lib/format';
import type { AttentionItem } from '../lib/commandCenterSignals';

interface KpiStripProps {
  kpis: Kpis;
  granularity: PeriodGranularity;
  attentionItems: AttentionItem[];
  onInvestigate: (item: AttentionItem) => void;
}

const CAPTION: Record<PeriodGranularity, string> = {
  month: 'vs prior month',
  quarter: 'vs prior quarter',
  ytd: 'vs prior year to date',
};

const TONE_CLASS: Record<'green' | 'red' | 'neutral', string> = {
  green: 'text-accent-green',
  red: 'text-accent-red',
  neutral: 'text-text-secondary',
};

interface CardDef {
  key: keyof Kpis;
  eyebrow: string;
  format: (v: number) => string;
  /** Whether a decrease counts as the good direction for this metric — feeds deltaTone() only, never used to pick a fixed headline color. */
  invert?: boolean;
  /** Which Needs Attention signal (if any) this card can surface a contextual link for — see lib/commandCenterSignals.ts. */
  signal?: AttentionItem['signal'];
}

const CARDS: CardDef[] = [
  { key: 'revenue', eyebrow: 'Monthly Bakery Revenue', format: (v) => formatAED(v, { compact: true }) },
  { key: 'grossMargin', eyebrow: 'Gross Margin', format: (v) => formatPercent(v), signal: 'margin' },
  { key: 'wastageCost', eyebrow: 'Wastage Cost', format: (v) => formatAED(v, { compact: true }), invert: true, signal: 'wastage' },
  { key: 'capacityUtilization', eyebrow: 'Capacity Utilization', format: (v) => formatPercent(v) },
  { key: 'workingCapital', eyebrow: 'Working Capital in Inventory', format: (v) => formatAED(v, { compact: true }) },
];

export function KpiStrip({ kpis, granularity, attentionItems, onInvestigate }: KpiStripProps) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle shadow-card sm:grid-cols-2 lg:grid-cols-5">
      {CARDS.map((card) => {
        const kpi = kpis[card.key];
        const tone = deltaTone(kpi.delta, card.invert);
        const deltaText = formatDelta(kpi.delta);
        // Only ever shown when computeAttentionItems has actually flagged
        // this signal for the current cell — never unconditionally clickable.
        const item = card.signal ? attentionItems.find((i) => i.signal === card.signal) : undefined;
        return (
          <div key={card.key} className="bg-bg-panel p-5">
            <p className="font-sans text-xs font-medium text-text-tertiary">{card.eyebrow}</p>
            <p className="mt-3 font-sans font-tabular text-2xl font-semibold text-text-primary sm:text-[28px]">{card.format(kpi.value)}</p>
            <p className={`mt-2 font-sans text-xs font-medium ${TONE_CLASS[tone]}`}>
              {deltaText ? `${deltaText} ${CAPTION[granularity]}` : '—'}
            </p>
            {item && (
              <button
                type="button"
                onClick={() => onInvestigate(item)}
                className="mt-2 font-sans text-xs font-medium text-accent-blue hover:underline"
              >
                {item.linkLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
