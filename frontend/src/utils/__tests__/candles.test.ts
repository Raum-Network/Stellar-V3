import { describe, expect, it } from "vitest";
import { buildCandles, bucketMsForTimeframe } from "../candles";

describe("candles", () => {
  it("maps timeframes to deterministic bucket durations", () => {
    expect(bucketMsForTimeframe("1s")).toBe(1_000);
    expect(bucketMsForTimeframe("1m")).toBe(60_000);
    expect(bucketMsForTimeframe("1h")).toBe(3_600_000);
    expect(bucketMsForTimeframe("1d")).toBe(86_400_000);
  });

  it("builds OHLC candles per bucket", () => {
    const candles = buildCandles(
      [
        { ts: 0, price: 1.0 },
        { ts: 120, price: 1.4 },
        { ts: 860, price: 0.9 },
        { ts: 1_100, price: 1.2 },
        { ts: 1_800, price: 1.1 },
      ],
      "1s",
      5_000,
      { formatLabel: (ts) => String(ts) }
    );

    expect(candles).toHaveLength(2);
    expect(candles[0]).toMatchObject({
      ts: 0,
      open: 1.0,
      high: 1.4,
      low: 0.9,
      close: 0.9,
      label: "0",
    });
    expect(candles[1]).toMatchObject({
      ts: 1_000,
      open: 1.2,
      high: 1.2,
      low: 1.1,
      close: 1.1,
      label: "1000",
    });
  });

  it("keeps stable bucket boundaries at timeframe edges", () => {
    const candles = buildCandles(
      [
        { ts: 999, price: 1.0 },
        { ts: 1_000, price: 2.0 },
        { ts: 1_001, price: 3.0 },
      ],
      "1s"
    );

    expect(candles).toHaveLength(2);
    expect(candles[0].ts).toBe(0);
    expect(candles[1].ts).toBe(1_000);
    expect(candles[1].open).toBe(2.0);
  });

  it("handles empty and single-point datasets", () => {
    expect(buildCandles([], "1s")).toEqual([]);

    const one = buildCandles([{ ts: 42_000, price: 7.25 }], "1m", 100_000, {
      formatLabel: () => "single",
    });

    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({
      ts: 0,
      open: 7.25,
      high: 7.25,
      low: 7.25,
      close: 7.25,
      label: "single",
    });
  });

  it("respects window filtering before aggregation", () => {
    const candles = buildCandles(
      [
        { ts: 1_000, price: 1.0 },
        { ts: 4_500, price: 1.1 },
        { ts: 9_000, price: 1.2 },
      ],
      "1s",
      10_000,
      { windowMs: 2_000 }
    );

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      ts: 9_000,
      open: 1.2,
      close: 1.2,
    });
  });
});
