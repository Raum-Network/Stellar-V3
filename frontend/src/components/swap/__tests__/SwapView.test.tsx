import React from "react";
import { renderWithI18n } from "@/test/renderWithI18n";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_IDS } from "@/contracts/config";
import { SwapView } from "../SwapView";

const mockUseStellar = vi.fn();
const mockSignAndSend = vi.fn();
const mockSwapExactInput = vi.fn();
const mockQuoteExactInput = vi.fn();
const mockApproveToken = vi.fn();
const mockCheckAllowance = vi.fn();
const mockAddToken = vi.fn();

vi.mock("@/context/StellarContext", () => ({
  useStellar: () => mockUseStellar(),
}));

vi.mock("@stellar/freighter-api", () => ({
  addToken: (...args: unknown[]) => mockAddToken(...args),
}));

vi.mock("../SettingsModal", () => ({
  SettingsModal: () => null,
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

describe("SwapView", () => {
  beforeEach(() => {
    mockUseStellar.mockReset();
    mockSignAndSend.mockReset();
    mockSwapExactInput.mockReset();
    mockQuoteExactInput.mockReset();
    mockApproveToken.mockReset();
    mockCheckAllowance.mockReset();
    mockAddToken.mockReset();
    mockAddToken.mockResolvedValue({
      contractId: CONTRACT_IDS.usdc,
    });
  });

  it("renders chart timeframe controls from 1s to 1M", async () => {
    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    const view = renderWithI18n(<SwapView />);
    await waitFor(() => expect(mockUseStellar).toHaveBeenCalled());

    const timeframes = ["1s", "5s", "15s", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
    for (const timeframe of timeframes) {
      expect(screen.getByRole("button", { name: timeframe })).toBeInTheDocument();
    }
    view.unmount();
  });

  it("renders desktop panel wrappers with inversion classes and chart mode toggles", async () => {
    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);
    await waitFor(() => expect(mockUseStellar).toHaveBeenCalled());

    expect(screen.getByTestId("swap-trade-panel").className).toContain("order-1");
    expect(screen.getByTestId("swap-trade-panel").className).toContain("lg:order-2");
    expect(screen.getByTestId("swap-chart-panel").className).toContain("order-2");
    expect(screen.getByTestId("swap-chart-panel").className).toContain("lg:order-1");

    expect(screen.getByRole("button", { name: "Line" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Candle" })).toBeInTheDocument();
  });

  it("shows insufficient-data state in candle mode when live buckets are too few", async () => {
    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Candle" }));

    await waitFor(() => {
      expect(screen.getByText("Insufficient live 1m data for candles")).toBeInTheDocument();
    });
  });

  it("quotes from pool tick and executes approval + swap", async () => {
    mockSwapExactInput.mockResolvedValue({ signAndSend: mockSignAndSend });
    mockCheckAllowance.mockResolvedValue(BigInt(0));
    mockSignAndSend.mockResolvedValue(undefined);

    mockUseStellar.mockReturnValue({
      router: {
        swap_exact_input: mockSwapExactInput,
      },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10");

    await waitFor(() => {
      expect(screen.getByText("Min Received")).toBeInTheDocument();
    });

    expect(mockSwapExactInput).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Execute Swap/i }));

    await waitFor(() => {
      expect(mockCheckAllowance).toHaveBeenCalledWith(
        CONTRACT_IDS.xlm,
        "GUSER",
        CONTRACT_IDS.xlm_usdc_pool
      );
    });

    await waitFor(
      () => {
        expect(mockApproveToken).toHaveBeenCalled();
        expect(mockSwapExactInput).toHaveBeenCalledWith(
          expect.objectContaining({
            payer: "GUSER",
            recipient: "GUSER",
          })
        );
        expect(mockSignAndSend).toHaveBeenCalled();
        expect(mockAddToken).toHaveBeenCalledWith({
          contractId: CONTRACT_IDS.usdc,
          networkPassphrase: "Test SDF Network ; September 2015",
        });
        expect((input as HTMLInputElement).value).toBe("");
        expect(screen.queryByText("Insufficient balance for swap")).not.toBeInTheDocument();
      },
      { timeout: 10000 }
    );
  }, 15000);

  it("shows pool-not-found quote error when state is missing", async () => {
    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue(null),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10");

    await waitFor(() => {
      expect(
        screen.getByText("Pool not found - ensure contracts are deployed")
      ).toBeInTheDocument();
    });
  });

  it("handles missing router by showing connect wallet error", async () => {
    mockUseStellar.mockReturnValue({
      router: null,
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10");

    await waitFor(() => {
      expect(screen.getByText("Min Received")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Execute Swap/i }));
    expect(screen.getByText("Please connect your wallet first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry Swap/i })).toBeInTheDocument();
  });

  it("maps transfer-related InvalidAction to insufficient liquidity (not slippage)", async () => {
    mockCheckAllowance.mockResolvedValue(BigInt("999999999999"));
    mockSwapExactInput.mockRejectedValue(
      new Error('HostError: Error(WasmVm, InvalidAction) ... ["contract call failed", transfer, [...]]')
    );

    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10");

    await waitFor(() => {
      expect(screen.getByText("Min Received")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Execute Swap/i }));

    await waitFor(() => {
      expect(screen.getByText("Insufficient liquidity in pool")).toBeInTheDocument();
      expect(screen.queryByText("Slippage too low - try increasing slippage tolerance")).not.toBeInTheDocument();
    });
  });

  it("skips approval when allowance is sufficient and accepts BLUX already submitted result", async () => {
    mockSwapExactInput.mockResolvedValue({ signAndSend: mockSignAndSend });
    mockCheckAllowance.mockResolvedValue(BigInt("999999999999"));
    mockSignAndSend.mockRejectedValue(new Error("BLUX_ALREADY_SUBMITTED:abc123"));

    mockUseStellar.mockReturnValue({
      router: {
        swap_exact_input: mockSwapExactInput,
      },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi.fn().mockResolvedValue("100000000"),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10");

    await waitFor(() => {
      expect(screen.getByText("Min Received")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Execute Swap/i }));

    await waitFor(
      () => {
        expect(mockApproveToken).not.toHaveBeenCalled();
        expect(mockSwapExactInput).toHaveBeenCalledWith(
          expect.objectContaining({
            payer: "GUSER",
            recipient: "GUSER",
          })
        );
        expect(screen.getByRole("button", { name: /Swap Success/i })).toBeInTheDocument();
        expect(mockAddToken).toHaveBeenCalledWith({
          contractId: CONTRACT_IDS.usdc,
          networkPassphrase: "Test SDF Network ; September 2015",
        });
      },
      { timeout: 10000 }
    );
  }, 15000);

  it("uses quoter output to calculate price impact", async () => {
    mockQuoteExactInput.mockResolvedValue(BigInt("90000000")); // 9.0 output against 10.0 spot

    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      quoteExactInput: mockQuoteExactInput,
      getTokenBalance: vi
        .fn()
        .mockImplementation((tokenAddress: string, userAddress: string) => {
          if (userAddress === "GUSER") {
            if (tokenAddress === CONTRACT_IDS.xlm) return Promise.resolve("1000000000000");
            if (tokenAddress === CONTRACT_IDS.usdc) return Promise.resolve("0");
          }
          if (userAddress === CONTRACT_IDS.xlm_usdc_pool) {
            if (tokenAddress === CONTRACT_IDS.xlm) return Promise.resolve("1000000000000");
            if (tokenAddress === CONTRACT_IDS.usdc) return Promise.resolve("1000000000000");
          }
          return Promise.resolve("0");
        }),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10");

    await waitFor(() => {
      expect(mockQuoteExactInput).toHaveBeenCalledWith(
        expect.objectContaining({
          poolAddress: CONTRACT_IDS.xlm_usdc_pool,
          tokenIn: CONTRACT_IDS.xlm,
          tokenOut: CONTRACT_IDS.usdc,
          fee: 3000,
          amountIn: BigInt("100000000"),
        })
      );
      expect(screen.getByText("10.00%")).toBeInTheDocument();
    });
  });

  it("shows non-zero price impact for large swaps against shallow pool depth", async () => {
    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance: vi
        .fn()
        .mockImplementation((tokenAddress: string, userAddress: string) => {
          if (userAddress === "GUSER") {
            if (tokenAddress === CONTRACT_IDS.xlm) return Promise.resolve("1000000000000"); // 100,000 XLM
            if (tokenAddress === CONTRACT_IDS.usdc) return Promise.resolve("0");
          }
          if (userAddress === CONTRACT_IDS.xlm_usdc_pool) {
            if (tokenAddress === CONTRACT_IDS.xlm) return Promise.resolve("200000000000"); // 20,000 XLM
            if (tokenAddress === CONTRACT_IDS.usdc) return Promise.resolve("500000000000"); // 50,000 USDC
          }
          return Promise.resolve("0");
        }),
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const input = screen.getAllByPlaceholderText("0.00")[0];
    await user.clear(input);
    await user.type(input, "10000");

    await waitFor(() => {
      expect(screen.getByText("Min Received")).toBeInTheDocument();
      expect(screen.getByText("33.33%")).toBeInTheDocument();
    });
  });

  it("uses exact on-chain precision for MAX input", async () => {
    const getTokenBalance = vi.fn().mockImplementation((tokenAddress: string, userAddress: string) => {
      if (userAddress === "GUSER") {
        if (tokenAddress === CONTRACT_IDS.xlm) return Promise.resolve("100000000");
        if (tokenAddress === CONTRACT_IDS.usdc) return Promise.resolve("63679");
      }
      // Pool balance checks during quote path
      return Promise.resolve("100000000");
    });

    mockUseStellar.mockReturnValue({
      router: { swap_exact_input: mockSwapExactInput },
      address: "GUSER",
      walletType: "freighter",
      getTokenBalance,
      approveToken: mockApproveToken,
      checkAllowance: mockCheckAllowance,
      getPoolState: vi.fn().mockResolvedValue({
        currentTick: 0,
        token0: CONTRACT_IDS.xlm,
      }),
    });

    renderWithI18n(<SwapView />);

    const user = userEvent.setup();
    const directionButton = screen.getByRole("button", { name: /Swap token direction/i });
    await user.click(directionButton);

    const maxButton = screen.getByRole("button", { name: /Max/i });
    await user.click(maxButton);

    const input = screen.getAllByPlaceholderText("0.00")[0] as HTMLInputElement;
    expect(input.value).toBe("0.0063679");
  });
});
