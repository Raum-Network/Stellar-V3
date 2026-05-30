"use client";

import React from "react";
import type { CandlePoint } from "@/utils/candles";

interface CandlestickChartProps {
  data: CandlePoint[];
  id?: string;
}

interface ChartSize {
  width: number;
  height: number;
}

const MIN_BODY_HEIGHT = 1.5;
const CHART_PADDING = { top: 10, right: 10, bottom: 14, left: 10 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const CandlestickChart = ({
  data,
  id = "swap-candles",
}: CandlestickChartProps) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<ChartSize>({ width: 0, height: 0 });
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => {
        window.removeEventListener("resize", updateSize);
      };
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!data.length) {
    return <div className="h-full w-full animate-pulse bg-white/5" />;
  }

  const innerWidth = Math.max(0, size.width - CHART_PADDING.left - CHART_PADDING.right);
  const innerHeight = Math.max(0, size.height - CHART_PADDING.top - CHART_PADDING.bottom);

  if (!innerWidth || !innerHeight) {
    return <div ref={containerRef} className="h-full w-full" />;
  }

  const highs = data.map((entry) => entry.high);
  const lows = data.map((entry) => entry.low);
  const minLow = Math.min(...lows);
  const maxHigh = Math.max(...highs);
  const range = Math.max(maxHigh - minLow, Math.abs(maxHigh) * 0.001, 0.0001);
  const yScale = (price: number) =>
    CHART_PADDING.top + ((maxHigh - price) / range) * innerHeight;

  const step = innerWidth / Math.max(data.length, 1);
  const bodyWidth = clamp(step * 0.62, 2.5, 14);

  const toPriceColor = (open: number, close: number) => {
    if (close > open) return "var(--accent)";
    if (close < open) return "#b26a6a";
    return "var(--muted)";
  };

  const onPointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left - CHART_PADDING.left, 0, innerWidth);
    const index = clamp(Math.floor(x / step), 0, data.length - 1);
    setHoverIndex(index);
    setCursor({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const onPointerLeave = () => {
    setHoverIndex(null);
    setCursor(null);
  };

  const hoveredCandle = hoverIndex !== null ? data[hoverIndex] : null;
  const tooltipLeft = cursor ? clamp(cursor.x + 10, 8, size.width - 160) : 8;
  const tooltipTop = cursor ? clamp(cursor.y - 56, 8, size.height - 62) : 8;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        onMouseMove={onPointerMove}
        onMouseLeave={onPointerLeave}
        role="img"
        aria-label={`${id}-candlestick-chart`}
      >
        {data.map((entry, index) => {
          const centerX = CHART_PADDING.left + index * step + step / 2;
          const wickTop = yScale(entry.high);
          const wickBottom = yScale(entry.low);
          const openY = yScale(entry.open);
          const closeY = yScale(entry.close);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), MIN_BODY_HEIGHT);
          const color = toPriceColor(entry.open, entry.close);
          const isHovered = hoverIndex === index;

          return (
            <g key={`${entry.ts}-${index}`} opacity={isHovered ? 1 : 0.9}>
              <line
                x1={centerX}
                x2={centerX}
                y1={wickTop}
                y2={wickBottom}
                stroke={color}
                strokeWidth={isHovered ? 1.8 : 1.2}
              />
              <rect
                x={centerX - bodyWidth / 2}
                y={bodyY}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
                fillOpacity={entry.close >= entry.open ? 0.9 : 0.72}
                stroke={color}
                strokeWidth={isHovered ? 1 : 0.6}
                rx={0.6}
              />
            </g>
          );
        })}
      </svg>

      {hoveredCandle && cursor && (
        <div
          className="pointer-events-none absolute z-10 min-w-[132px] rounded-xl border border-[var(--border)] bg-[var(--background)]/95 px-2 py-1.5 shadow-xl"
          style={{ left: tooltipLeft, top: tooltipTop }}
        >
          <p className="text-[8px] font-mono text-[var(--muted)]">{hoveredCandle.label}</p>
          <p className="text-[9px] font-mono font-semibold text-[var(--foreground)]">
            O {hoveredCandle.open.toFixed(4)} H {hoveredCandle.high.toFixed(4)}
          </p>
          <p className="text-[9px] font-mono font-semibold text-[var(--foreground)]">
            L {hoveredCandle.low.toFixed(4)} C {hoveredCandle.close.toFixed(4)}
          </p>
        </div>
      )}
    </div>
  );
};

