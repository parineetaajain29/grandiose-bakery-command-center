import { useRef } from 'react';
import { ChartExportButton } from '../../shared/ChartExportButton';

type Level = 'low' | 'moderate' | 'high';

interface RiskConfidenceGaugeProps {
  level: Level;
  label: string;
  /** Band colors in low -> moderate -> high order. Risk and confidence use
   * opposite semantics (risk: green/orange/red; confidence: red/orange/green,
   * matching UnderstandStage.tsx's existing RISK_TILE/CONFIDENCE_TILE), so
   * this is passed in rather than hardcoded. */
  colors: [string, string, string];
  /** Which research result this gauge reflects — the closest thing this
   * compact gauge has to an "active filter" worth recording on export. */
  filterContext?: string;
  /** Passed in, not hardcoded — this is only genuinely "External Research —
   * Live" when the underlying research actually retrieved live sources;
   * the parent (which knows research.sourcesRetrieved) decides the label. */
  sourceLabel?: string;
}

// Same semicircular-arc/needle technique as WastageGauge.tsx (that file's own
// CX/CY/R/BAND_WIDTH constants and polarToCartesian/bandArcPath helpers),
// adapted for a discrete low/moderate/high classification rather than a
// continuous value against a fixed target — there's no single numeric axis
// or target line for a risk/confidence level, so this divides the arc into
// three equal bands instead, with the needle centered on the active one.
const CX = 100;
const CY = 90;
const R = 78;
const BAND_WIDTH = 14;
const LEVEL_INDEX: Record<Level, number> = { low: 0, moderate: 1, high: 2 };

function angleForFraction(fraction: number): number {
  return 180 - fraction * 180;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function bandArcPath(fromFraction: number, toFraction: number): string {
  const start = polarToCartesian(CX, CY, R, angleForFraction(fromFraction));
  const end = polarToCartesian(CX, CY, R, angleForFraction(toFraction));
  return `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`;
}

export function RiskConfidenceGauge({ level, label, colors, filterContext, sourceLabel }: RiskConfidenceGaugeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const index = LEVEL_INDEX[level];
  const needle = polarToCartesian(CX, CY, R - BAND_WIDTH / 2 - 6, angleForFraction((index + 0.5) / 3));

  return (
    <div ref={containerRef} className="flex flex-col items-center rounded-card border border-border-subtle bg-bg-panel p-4">
      <div className="flex w-full items-center justify-between gap-2">
        <p className="font-sans text-xs font-medium text-text-tertiary">{label}</p>
        <ChartExportButton containerRef={containerRef} title={label} filterContext={filterContext} sourceLabel={sourceLabel} />
      </div>
      <svg viewBox="0 0 200 110" className="mt-1 w-full max-w-[180px]">
        <path d={bandArcPath(0, 1 / 3)} stroke={colors[0]} strokeOpacity={0.35} strokeWidth={BAND_WIDTH} fill="none" strokeLinecap="butt" />
        <path d={bandArcPath(1 / 3, 2 / 3)} stroke={colors[1]} strokeOpacity={0.35} strokeWidth={BAND_WIDTH} fill="none" strokeLinecap="butt" />
        <path d={bandArcPath(2 / 3, 1)} stroke={colors[2]} strokeOpacity={0.35} strokeWidth={BAND_WIDTH} fill="none" strokeLinecap="butt" />
        <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="var(--text-primary)" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={4} fill="var(--text-primary)" />
      </svg>
      <p className="-mt-6 font-sans text-lg font-semibold capitalize" style={{ color: colors[index] }}>
        {level}
      </p>
    </div>
  );
}
