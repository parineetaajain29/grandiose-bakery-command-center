import { scenariosFile } from '../../data';
import { formatPercent } from '../../lib/format';

interface WastageGaugeProps {
  value: number;
}

// Streamlit: gauge axis range [0, 8], bands [0,target]=green, [target,3]=amber,
// [3,8]=red, needle at WASTAGE_TARGET_PCT (app.py lines 2078-2102). The 1%
// target is scenariosFile.meta.wastageTarget — the same value used everywhere
// else in the app (Company Profile, SKU Performance), never duplicated here.
const AXIS_MAX = 8;
const AMBER_END = 3;
const TARGET = scenariosFile.meta.wastageTarget;

const CX = 100;
const CY = 90;
const R = 78;
const BAND_WIDTH = 14;

function angleForValue(v: number): number {
  const clamped = Math.min(AXIS_MAX, Math.max(0, v));
  return 180 - (clamped / AXIS_MAX) * 180;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function bandArcPath(from: number, to: number): string {
  const start = polarToCartesian(CX, CY, R, angleForValue(from));
  const end = polarToCartesian(CX, CY, R, angleForValue(to));
  const largeArcFlag = Math.abs(angleForValue(from) - angleForValue(to)) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export function WastageGauge({ value }: WastageGaugeProps) {
  const needle = polarToCartesian(CX, CY, R - BAND_WIDTH / 2 - 6, angleForValue(value));
  const comparison = value > TARGET ? 'above' : value < TARGET ? 'below' : 'at';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-[280px]">
        <path d={bandArcPath(0, TARGET)} stroke="var(--accent-green)" strokeOpacity={0.35} strokeWidth={BAND_WIDTH} fill="none" strokeLinecap="butt" />
        <path d={bandArcPath(TARGET, AMBER_END)} stroke="var(--accent-orange)" strokeOpacity={0.35} strokeWidth={BAND_WIDTH} fill="none" strokeLinecap="butt" />
        <path d={bandArcPath(AMBER_END, AXIS_MAX)} stroke="var(--accent-red)" strokeOpacity={0.35} strokeWidth={BAND_WIDTH} fill="none" strokeLinecap="butt" />
        <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="var(--text-primary)" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={4} fill="var(--text-primary)" />
      </svg>
      <p className="-mt-6 font-sans font-tabular text-2xl font-semibold text-text-primary">{formatPercent(value)}</p>
      <p className="mt-3 max-w-xs text-center font-sans text-xs text-text-tertiary">
        Needle marks the {formatPercent(TARGET)} company target · current is {comparison} target.
      </p>
    </div>
  );
}
