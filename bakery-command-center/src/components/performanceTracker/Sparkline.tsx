import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color: string;
}

/** Tiny fill-area trend chart, axes hidden — matches the Streamlit source's bare sparkline() (app.py lines 474-485), which is rendering-only, not a derived figure. */
export function Sparkline({ data, color }: SparklineProps) {
  const rows = data.map((value, i) => ({ i, value }));
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area dataKey="value" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.15} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
