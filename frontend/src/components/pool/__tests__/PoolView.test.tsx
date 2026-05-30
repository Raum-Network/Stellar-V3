import React from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test/renderWithI18n";
import { CONTRACT_IDS } from "@/contracts/config";
import { PoolView } from "../PoolView";

const mockUseStellar = vi.fn();

vi.mock("@/context/StellarContext", () => ({
  useStellar: () => mockUseStellar(),
}));

vi.mock("@stellar/freighter-api", () => ({
  addToken: vi.fn(),
}));

vi.mock("@/hooks/useIsDesktop", () => ({
  useIsDesktop: () => true,
}));

vi.mock("@/components/dashboard/PriceChart", () => ({
  PriceChart: () => <div data-testid="pool-price-chart" />,
}));

vi.mock("@/components/ui/NumberField", () => ({
  NumberField: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
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
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

describe("PoolView", () => {
  it("reloads local positions when footer refresh event is dispatched", async () => {
    mockUseStellar.mockReturnValue({
      address: "GUSER1234567890",
      walletType: "freighter",
      positionManager: null,
      getTokenBalance: vi.fn().mockResolvedValue("0"),
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    const initial = [
      {
        id: "GUSER12345_1",
        positionId: 1,
        ownerAddress: "GUSER1234567890",
        token0: "XLM",
        token1: "USDC",
        tickLower: -60,
        tickUpper: 60,
        liquidity: "1000",
        minPrice: "0.1000",
        maxPrice: "0.1500",
        amount0: "1",
        amount1: "1",
        createdAt: Date.now(),
      },
    ];
    window.localStorage.setItem("clmm_positions", JSON.stringify(initial));

    renderWithI18n(<PoolView />);

    await waitFor(() => {
      expect(screen.getByText("Your_Liquidity_Positions [1]")).toBeInTheDocument();
    });

    const updated = [
      ...initial,
      {
        ...initial[0],
        id: "GUSER12345_2",
        positionId: 2,
      },
    ];
    window.localStorage.setItem("clmm_positions", JSON.stringify(updated));
    act(() => {
      window.dispatchEvent(new Event("pools:positions-refresh-local"));
    });

    await waitFor(() => {
      expect(screen.getByText("Your_Liquidity_Positions [2]")).toBeInTheDocument();
    });
  });

  it("quotes USDC immediately on step 1 when XLM input changes", async () => {
    mockUseStellar.mockReturnValue({
      address: "GUSER1234567890",
      walletType: "freighter",
      positionManager: null,
      getTokenBalance: vi.fn().mockResolvedValue("0"),
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        tickSpacing: 60,
        token0: CONTRACT_IDS.xlm,
        token1: CONTRACT_IDS.usdc,
        feesUncollected0: BigInt(0),
        feesUncollected1: BigInt(0),
      }),
    });

    renderWithI18n(<PoolView />);

    await userEvent.click(screen.getAllByText("Add Liquidity")[0]);

    const xlmInput = screen.getByPlaceholderText("0.0000");
    const usdcInput = screen.getByPlaceholderText("0.00");

    await userEvent.clear(xlmInput);
    await userEvent.type(xlmInput, "1");

    await waitFor(() => {
      expect(Number((usdcInput as HTMLInputElement).value)).toBeGreaterThan(0);
    });
  });

  it("does not show cached positions when ownerAddress is another wallet", async () => {
    mockUseStellar.mockReturnValue({
      address: "GUSER1234567890",
      walletType: "freighter",
      positionManager: null,
      getTokenBalance: vi.fn().mockResolvedValue("0"),
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    window.localStorage.setItem(
      "clmm_positions",
      JSON.stringify([
        {
          id: "GUSER12345_999",
          positionId: 999,
          ownerAddress: "GOTHERWALLET0001",
          token0: "XLM",
          token1: "USDC",
          tickLower: -60,
          tickUpper: 60,
          liquidity: "1000",
          minPrice: "0.1000",
          maxPrice: "0.1500",
          amount0: "1",
          amount1: "1",
          createdAt: Date.now(),
        },
      ])
    );

    renderWithI18n(<PoolView />);

    await waitFor(() => {
      expect(screen.getByText("Your_Liquidity_Positions [0]")).toBeInTheDocument();
    });
  });
});
