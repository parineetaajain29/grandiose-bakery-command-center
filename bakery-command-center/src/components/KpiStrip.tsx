import type { Kpis, PeriodGranularity } from '../data';
import { deltaTone, formatAED, formatDelta, formatPercent } from '../lib/format';

interface KpiStripProps {
  kpis: Kpis;
  granularity: PeriodGranularity;
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
  invert?: boolean;
  numberClass?: string;
}

const CARDS: CardDef[] = [
  { key: 'revenue', eyebrow: 'MONTHLY BAKERY REVENUE', format: (v) => formatAED(v, { compact: true }) },
  { key: 'grossMargin', eyebrow: 'GROSS MARGIN', format: (v) => formatPercent(v) },
  {
    key: 'wastageCost',
    eyebrow: 'WASTAGE COST',
    format: (v) => formatAED(v, { compact: true }),
    invert: true,
    numberClass: 'text-accent-orange',
  },
  {
    key: 'capacityUtilization',
    eyebrow: 'CAPACITY UTILIZATION',
    format: (v) => formatPercent(v),
    numberClass: 'text-accent-green',
  },
  { key: 'workingCapital', eyebrow: 'WORKING CAPITAL IN INVENTORY', format: (v) => formatAED(v, { compact: true }) },
];

export function KpiStrip({ kpis, granularity }: KpiStripProps) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-5">
      {CARDS.map((card) => {
        const kpi = kpis[card.key];
        const tone = deltaTone(kpi.delta, card.invert);
        const deltaText = formatDelta(kpi.delta);
        return (
          <div key={card.key} className="bg-bg-panel p-5">
            <p className="font-mono text-[11px] tracking-[0.14em] text-text-secondary">{card.eyebrow}</p>
            <p className={`mt-3 font-sans font-tabular text-2xl font-semibold sm:text-[28px] ${card.numberClass ?? 'text-text-primary'}`}>
              {card.format(kpi.value)}
            </p>
            <p className={`mt-2 font-mono text-xs ${TONE_CLASS[tone]}`}>
              {deltaText ? `${deltaText} ${CAPTION[granularity]}` : '—'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
