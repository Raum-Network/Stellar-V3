import React from "react";
import { renderWithI18n } from "@/test/renderWithI18n";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CONTRACT_IDS } from "@/contracts/config";
import { DashboardView } from "../DashboardView";

const mockUseStellar = vi.fn();

vi.mock("@/context/StellarContext", () => ({
  useStellar: () => mockUseStellar(),
}));

vi.mock("@/hooks/useIsDesktop", () => ({
  useIsDesktop: () => true,
}));

vi.mock("../PriceChart", () => ({
  PriceChart: () => <div data-testid="price-chart" />,
}));

vi.mock("framer-motion", () => {
  const Mock = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  );
  return {
    motion: new Proxy(
      {},
      {
        get: () => Mock,
      }
    ),
  };
});

describe("DashboardView", () => {
  it("loads pool metrics and renders tick-based spot price", async () => {
    mockUseStellar.mockReturnValue({
      address: "GABC",
      getTokenBalance: vi
        .fn()
        .mockResolvedValueOnce("100000000")
        .mockResolvedValueOnce("50000000"),
      getPoolState: vi.fn().mockResolvedValue({
        liquidity: BigInt(1000000),
        currentTick: 0,
        fee: 3000,
        feesUncollected0: BigInt(1200000),
        feesUncollected1: BigInt(2200000),
        token0: CONTRACT_IDS.xlm,
        token1: CONTRACT_IDS.usdc,
      }),
      positionManager: {
        total_supply: vi.fn().mockResolvedValue({ result: 3 }),
        balance_of: vi.fn().mockResolvedValue({ result: 2 }),
      },
    });

    renderWithI18n(<DashboardView />);

    await waitFor(() => {
      expect(screen.getByText("1.0000")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/POOL_SYNC: PRICE 1\.0000 USDC\/XLM/)).toBeInTheDocument();
    });
    expect(screen.getByText("$15.00")).toBeInTheDocument();

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Your positions: 2/)).toBeInTheDocument();
  });

  it("handles missing wallet and inverts price when token0 is USDC", async () => {
    mockUseStellar.mockReturnValue({
      address: null,
      getTokenBalance: vi
        .fn()
        .mockResolvedValueOnce("200000000")
        .mockResolvedValueOnce("100000000"),
      getPoolState: vi.fn().mockResolvedValue({
        liquidity: BigInt(500000),
        currentTick: 6931,
        fee: 3000,
        feesUncollected0: BigInt(0),
        feesUncollected1: BigInt(0),
        token0: CONTRACT_IDS.usdc,
        token1: CONTRACT_IDS.xlm,
      }),
      positionManager: null,
    });

    renderWithI18n(<DashboardView />);

    await waitFor(() => {
      const value = screen.getByText((text) => /^0\.5\d{3}$/.test(text));
      expect(value).toBeInTheDocument();
    });

    expect(screen.getByText("Connect wallet to view yours")).toBeInTheDocument();
    expect(screen.getByText(/POOL_SYNC: PRICE 0\.5\d{3} USDC\/XLM/)).toBeInTheDocument();
  });
});
