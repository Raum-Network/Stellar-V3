import { afterEach, describe, expect, it, vi } from "vitest";
import { PriceService } from "../PriceService";

describe("PriceService", () => {
  afterEach(() => {
    PriceService.clearCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns current prices from API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stellar: { usd: 0.12, usd_24h_change: 2.5 },
          "usd-coin": { usd: 1.0 },
        }),
      })
    );

    const prices = await PriceService.getPrices();
    expect(prices).toEqual({
      xlm: 0.12,
      usdc: 1,
      change24h: 2.5,
    });
  });

  it("returns fallback prices on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const prices = await PriceService.getPrices();
    expect(prices).toEqual({
      xlm: 0.1258,
      usdc: 1.0,
      change24h: 1.25,
    });
  });

  it("returns mapped hourly history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          prices: [
            [1700000000000, 0.1],
            [1700003600000, 0.2],
          ],
        }),
      })
    );

    const history = await PriceService.getHistory("stellar");
    expect(history).toHaveLength(2);
    expect(history[0].price).toBe(0.1);
    expect(typeof history[0].time).toBe("string");
  });

  it("returns empty history on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const history = await PriceService.getHistory("stellar");
    expect(history).toEqual([]);
  });
});
