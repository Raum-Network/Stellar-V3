export type CandleTimeframe =
  | "1s"
  | "5s"
  | "15s"
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d"
  | "1w"
  | "1M";

export interface CandleSourcePoint {
  ts: number;
  price: number;
}

export interface CandlePoint {
  ts: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const TIMEFRAME_TO_BUCKET_MS: Record<CandleTimeframe, number> = {
  "1s": 1_000,
  "5s": 5_000,
  "15s": 15_000,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
};

interface BuildCandlesOptions {
  windowMs?: number;
  formatLabel?: (timestamp: number) => string;
}

export const bucketMsForTimeframe = (timeframe: CandleTimeframe): number =>
  TIMEFRAME_TO_BUCKET_MS[timeframe];

const defaultLabel = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const buildCandles = (
  points: CandleSourcePoint[],
  timeframe: CandleTimeframe,
  now: number = Date.now(),
  options: BuildCandlesOptions = {}
): CandlePoint[] => {
  if (!Array.isArray(points) || points.length === 0) return [];

  const bucketMs = bucketMsForTimeframe(timeframe);
  const cutoff = typeof options.windowMs === "number" ? now - options.windowMs : Number.NEGATIVE_INFINITY;
  const formatLabel = options.formatLabel ?? defaultLabel;

  const sorted = points
    .filter(
      (point) =>
        Number.isFinite(point.ts) &&
        Number.isFinite(point.price) &&
        point.price > 0 &&
        point.ts >= cutoff
    )
    .slice()
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) return [];

  const buckets = new Map<number, CandlePoint>();

  for (const point of sorted) {
    const bucketTs = Math.floor(point.ts / bucketMs) * bucketMs;
    const existing = buckets.get(bucketTs);
    if (!existing) {
      buckets.set(bucketTs, {
        ts: bucketTs,
        label: formatLabel(bucketTs),
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
      });
      continue;
    }

    existing.high = Math.max(existing.high, point.price);
    existing.low = Math.min(existing.low, point.price);
    existing.close = point.price;
  }

  return Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
};

