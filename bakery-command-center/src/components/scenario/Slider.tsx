interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

/** Same slider treatment as ForecastModule's hiring slider — one shared component so every Scenario & Resilience module matches. */
export function Slider({ id, label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  return (
    <div>
      <label htmlFor={id} className="font-mono text-[11px] tracking-[0.1em] text-text-secondary">
        {label}
      </label>
      <div className="mt-2 flex items-center gap-4">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border-subtle accent-accent-blue"
        />
        <span className="w-16 shrink-0 text-right font-mono font-tabular text-sm text-text-primary">
          {value}
          {unit}
        </span>
      </div>
    </div>
  );
}
