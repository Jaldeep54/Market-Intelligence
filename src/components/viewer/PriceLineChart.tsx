"use client";

// No charting library exists in this project (package.json has none), and
// the spec explicitly says not to add a new dependency for this feature --
// so this is a small dependency-free SVG line chart instead. It intentionally
// covers only what Price Trends needs: multiple series sharing a date axis,
// a hover tooltip, a legend, and a fully responsive viewBox (no fixed pixel
// width, so it never causes horizontal scrolling on mobile).

import { useMemo, useState } from "react";

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  data: { date: string; value: number }[];
}

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 320;
const PADDING = { top: 16, right: 16, bottom: 36, left: 56 };

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function PriceLineChart({
  series,
  yUnit,
  formatValue = (v) => v.toFixed(2),
}: {
  series: ChartSeries[];
  yUnit: string;
  formatValue?: (value: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const dates = useMemo(() => {
    const set = new Set<string>();
    for (const s of series) for (const point of s.data) set.add(point.date);
    return Array.from(set).sort();
  }, [series]);

  const valuesByDate = useMemo(() => {
    return series.map((s) => {
      const map = new Map(s.data.map((p) => [p.date, p.value]));
      return dates.map((d) => map.get(d) ?? null);
    });
  }, [series, dates]);

  const allValues = valuesByDate.flat().filter((v): v is number => v !== null);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  const range = maxValue - minValue || 1;
  const yMin = minValue - range * 0.1;
  const yMax = maxValue + range * 0.1;

  const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom;

  function xFor(index: number): number {
    if (dates.length <= 1) return PADDING.left + innerWidth / 2;
    return PADDING.left + (index / (dates.length - 1)) * innerWidth;
  }

  function yFor(value: number): number {
    return PADDING.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;
  }

  if (dates.length === 0 || allValues.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Not enough price history yet.</p>;
  }

  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  const xLabelStep = Math.max(1, Math.ceil(dates.length / 6));

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const ratio = (relX - PADDING.left) / innerWidth;
    const index = Math.round(ratio * (dates.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), dates.length - 1));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="w-full touch-none"
          role="img"
          aria-label={`Price trend chart in ${yUnit}`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {yTickValues.map((tick, i) => (
            <g key={i}>
              <line
                x1={PADDING.left}
                x2={VIEW_WIDTH - PADDING.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text x={PADDING.left - 8} y={yFor(tick) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {dates.map((d, i) =>
            i % xLabelStep === 0 ? (
              <text
                key={d}
                x={xFor(i)}
                y={VIEW_HEIGHT - PADDING.bottom + 18}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted)"
              >
                {formatDate(d)}
              </text>
            ) : null
          )}

          {series.map((s, sIdx) => {
            const values = valuesByDate[sIdx];
            const segments: string[] = [];
            let current: string[] = [];
            values.forEach((v, i) => {
              if (v === null) {
                if (current.length > 1) segments.push(current.join(" "));
                current = [];
                return;
              }
              current.push(`${xFor(i)},${yFor(v)}`);
            });
            if (current.length > 1) segments.push(current.join(" "));

            return (
              <g key={s.id}>
                {segments.map((points, i) => (
                  <polyline key={i} points={points} fill="none" stroke={s.color} strokeWidth={2} />
                ))}
                {values.map((v, i) =>
                  v !== null ? <circle key={i} cx={xFor(i)} cy={yFor(v)} r={2.5} fill={s.color} /> : null
                )}
              </g>
            );
          })}

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING.top}
              y2={VIEW_HEIGHT - PADDING.bottom}
              stroke="var(--muted)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      {hoverIndex !== null && (
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <div className="mb-1 font-medium text-foreground">{formatDate(dates[hoverIndex])}</div>
          <div className="flex flex-col gap-1">
            {series.map((s, sIdx) => {
              const value = valuesByDate[sIdx][hoverIndex];
              if (value === null) return null;
              return (
                <div key={s.id} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatValue(value)} {yUnit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
