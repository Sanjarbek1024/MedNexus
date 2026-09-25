import { useState } from "react";

// Validated palette (dataviz validator, light surface): two-series blue/emerald passes every
// check; the three-series stack (emerald/yellow/violet) passes CVD all-pairs, and yellow's low
// contrast is relieved by the numeric table the stack sits in.
export const SERIES = { blue: "#2a78d6", emerald: "#059669", yellow: "#eda100", violet: "#4a3aa7" };

interface Tip { left: number | string; top: number; lines: string[] }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg"
      style={{ left: tip.left, top: tip.top - 8 }}
    >
      {tip.lines.map((line, i) => (
        <div key={i} className={i === 0 ? "font-semibold" : "text-white/80"}>{line}</div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} /> {item.label}
        </span>
      ))}
    </div>
  );
}

/** Grouped bars: one group per category, one bar per series (same scale, one axis). */
export function GroupedBars({ categories, series, height = 180 }: {
  categories: string[];
  series: { label: string; color: string; values: number[] }[];
  height?: number;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const width = 560;
  const pad = { top: 12, bottom: 26, left: 28, right: 8 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = [0, Math.ceil(max / 2), Math.ceil(max)];
  const plotH = height - pad.top - pad.bottom;
  const groupW = (width - pad.left - pad.right) / categories.length;
  const barW = Math.min(18, (groupW - 12) / series.length - 2);
  const y = (v: number) => pad.top + plotH - (v / ticks[2]) * plotH;

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray={tick ? "3 4" : undefined} />
            <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{tick}</text>
          </g>
        ))}
        {categories.map((category, i) => {
          const x0 = pad.left + i * groupW + (groupW - series.length * (barW + 2)) / 2;
          return (
            <g
              key={category}
              onMouseMove={(event) => {
                const rect = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setTip({
                  left: ((x0 + (series.length * (barW + 2)) / 2) / width) * rect.width,
                  top: (y(Math.max(...series.map((s) => s.values[i]))) / height) * rect.height,
                  lines: [category, ...series.map((s) => `${s.label}: ${s.values[i]}`)],
                });
              }}
            >
              <rect x={pad.left + i * groupW} y={pad.top} width={groupW} height={plotH} fill="transparent" />
              {series.map((s, j) => {
                const value = s.values[i];
                const h = Math.max(value ? 3 : 0, y(0) - y(value));
                return <rect key={s.label} x={x0 + j * (barW + 2)} y={y(0) - h} width={barW} height={h} rx={3} fill={s.color} />;
              })}
              <text x={pad.left + i * groupW + groupW / 2} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {category}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Single-series line over time with a crosshair tooltip; gaps where there is no data. */
export function RateLine({ points, color = SERIES.emerald, height = 170, format }: {
  points: { label: string; value: number | null; note: string }[];
  color?: string;
  height?: number;
  format: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const width = 560;
  const pad = { top: 14, bottom: 26, left: 36, right: 12 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - v * plotH;
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
    } else current += `${current ? "L" : "M"}${x(i)},${y(p.value)} `;
  });
  if (current) segments.push(current);
  const activePoint = active !== null ? points[active] : null;

  return (
    <div className="relative" onMouseLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * width;
          const index = Math.round(((px - pad.left) / plotW) * (points.length - 1));
          setActive(Math.min(points.length - 1, Math.max(0, index)));
        }}
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeDasharray={tick ? "3 4" : undefined} />
            <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{format(tick)}</text>
          </g>
        ))}
        {segments.map((d) => (
          <path key={d} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle key={p.label} cx={x(i)} cy={y(p.value)} r={active === i ? 5 : 4} fill={color} stroke="white" strokeWidth={2} />
          ),
        )}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotH} stroke="#94a3b8" strokeDasharray="2 3" />}
        {points.map((p, i) => (
          <text key={p.label} x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
            {p.label}
          </text>
        ))}
      </svg>
      {activePoint && (
        <Tooltip
          tip={{
            left: `${(x(active!) / width) * 100}%`,
            top: 0,
            lines: [activePoint.label, activePoint.value === null ? "—" : format(activePoint.value), activePoint.note],
          }}
        />
      )}
    </div>
  );
}

/** One horizontal stacked bar (parts of a whole), with 2px gaps between segments. */
export function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return <div className="h-2.5 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
      {parts.filter((p) => p.value > 0).map((part) => (
        <div
          key={part.label}
          title={`${part.label}: ${part.value}`}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(part.value / total) * 100}%`, background: part.color }}
        />
      ))}
    </div>
  );
}
