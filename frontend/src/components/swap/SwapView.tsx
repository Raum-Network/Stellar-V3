"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  ArrowDown,
  ChevronDown,
  Zap,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { addToken } from "@stellar/freighter-api";
import { useStellar } from "@/context/StellarContext";
import { CONTRACT_IDS } from "@/contracts/config";
import { SettingsModal } from "./SettingsModal";
import { NumberField } from "@/components/ui/NumberField";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { CandlestickChart } from "@/components/swap/CandlestickChart";
import { PriceService } from "@/services/PriceService";
import { useI18n } from "@/context/I18nContext";
import { priceFromTick } from "@/utils/price";
import { buildCandles } from "@/utils/candles";

type SwapStatus =
  | "idle"
  | "quoting"
  | "ready"
  | "approving"
  | "swapping"
  | "submitted"
  | "confirming"
  | "success"
  | "error";

const TOKEN_DECIMALS = 7;
const STROOPS_PER_TOKEN = BigInt(`1${"0".repeat(TOKEN_DECIMALS)}`);
const SUCCESS_STATUS_MIN_MS = 5000;
const QUOTE_ESTIMATE_BUFFER_BPS = BigInt(200); // 2.00% safety margin for tick-only quotes
const MAX_TOTAL_SLIPPAGE_BPS = BigInt(9900);
const BPS_DENOMINATOR = BigInt(10000);
const MAX_QUOTE_IMPACT_BPS = BigInt(9900);
const LIVE_CHART_RETENTION_MS = 4 * 60 * 60 * 1000;

type ChartTimeframe = "1s" | "5s" | "15s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
type ChartMode = "line" | "candle";
type ChartPoint = { ts: number; price: number };

const CHART_TIMEFRAME_ORDER: ChartTimeframe[] = [
  "1s",
  "5s",
  "15s",
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1M",
];

const CHART_TIMEFRAME_CONFIG: Record<
  ChartTimeframe,
  {
    windowMs: number;
    pollMs: number;
    marketHistory?: { days: number; interval: "hourly" | "daily" };
  }
> = {
  "1s": { windowMs: 60_000, pollMs: 1_000 },
  "5s": { windowMs: 5 * 60_000, pollMs: 5_000 },
  "15s": { windowMs: 15 * 60_000, pollMs: 15_000 },
  "1m": { windowMs: 60 * 60_000, pollMs: 30_000 },
  "5m": { windowMs: 4 * 60 * 60_000, pollMs: 30_000 },
  "15m": { windowMs: 4 * 60 * 60_000, pollMs: 30_000 },
  "1h": { windowMs: 24 * 60 * 60_000, pollMs: 60_000 },
  "4h": { windowMs: 7 * 24 * 60 * 60_000, pollMs: 60_000 },
  "1d": { windowMs: 24 * 60 * 60_000, pollMs: 30_000, marketHistory: { days: 1, interval: "hourly" } },
  "1w": { windowMs: 7 * 24 * 60 * 60_000, pollMs: 60_000, marketHistory: { days: 7, interval: "hourly" } },
  "1M": { windowMs: 30 * 24 * 60 * 60_000, pollMs: 60_000, marketHistory: { days: 30, interval: "daily" } },
};

const parseTokenAmountToStroops = (value: string): bigint | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;

  const [rawInt, rawFrac = ""] = trimmed.split(".");
  if (rawFrac.length > TOKEN_DECIMALS) return null;
  if (rawInt === "" && rawFrac === "") return null;

  const intPart = rawInt === "" ? "0" : rawInt;
  const fracPart = rawFrac.padEnd(TOKEN_DECIMALS, "0");
  return BigInt(intPart) * STROOPS_PER_TOKEN + BigInt(fracPart);
};

const formatStroopsToToken = (amount: bigint): string => {
  const negative = amount < BigInt(0);
  const abs = negative ? -amount : amount;
  const whole = abs / STROOPS_PER_TOKEN;
  const fractionRaw = (abs % STROOPS_PER_TOKEN)
    .toString()
    .padStart(TOKEN_DECIMALS, "0");
  const fraction = fractionRaw.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
};

export const SwapView = () => {
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [token0, setToken0] = useState<"XLM" | "USDC">("XLM");
  const [token1, setToken1] = useState<"XLM" | "USDC">("USDC");
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const lifecycleQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const lastLifecycleAtRef = React.useRef<number>(0);
  const successStatusUntilRef = React.useRef<number>(0);
  const successStatusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownSubmittedRef = React.useRef(false);
  const hasShownConfirmingRef = React.useRef(false);
  const [pricing, setPricing] = useState<{
    price: string;
    minOutput: string;
    priceImpact: number;
  } | null>(null);
  const [balances, setBalances] = useState<{ [key: string]: string }>({
    XLM: "0.00",
    USDC: "0.00",
  });
  const [balanceStroops, setBalanceStroops] = useState<{ [key: string]: bigint }>({
    XLM: BigInt(0),
    USDC: BigInt(0),
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>("1m");
  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [liveChartPoints, setLiveChartPoints] = useState<ChartPoint[]>([]);
  const [marketChartPoints, setMarketChartPoints] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const { router, address, walletType, getTokenBalance, approveToken, checkAllowance, getPoolState, quoteExactInput } = useStellar();
  const { t, language } = useI18n();
  const preciseBalances = React.useMemo(
    () => ({
      XLM: formatStroopsToToken(balanceStroops.XLM ?? BigInt(0)),
      USDC: formatStroopsToToken(balanceStroops.USDC ?? BigInt(0)),
    }),
    [balanceStroops]
  );
  const chartConfig = CHART_TIMEFRAME_CONFIG[chartTimeframe];
  const spotPollMs = chartConfig.marketHistory ? 30_000 : chartConfig.pollMs;

  const formatChartLabel = React.useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp);
      if (chartConfig.windowMs <= 15 * 60_000) {
        return date.toLocaleTimeString(language, {
          minute: "2-digit",
          second: "2-digit",
        });
      }
      if (chartConfig.windowMs <= 24 * 60 * 60_000) {
        return date.toLocaleTimeString(language, {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return date.toLocaleDateString(language, {
        month: "short",
        day: "numeric",
      });
    },
    [chartConfig.windowMs, language]
  );

  const appendLiveChartPoint = React.useCallback((price: number, timestamp = Date.now()) => {
    if (!Number.isFinite(price) || price <= 0) return;
    setLiveChartPoints((previous) => {
      const cutoff = timestamp - LIVE_CHART_RETENTION_MS;
      const retained = previous.filter((point) => point.ts >= cutoff);
      const last = retained[retained.length - 1];
      if (last && Math.abs(last.price - price) < 1e-12 && timestamp - last.ts < 500) {
        return retained;
      }
      return [...retained, { ts: timestamp, price }].slice(-6000);
    });
  }, []);

  const lineChartSeries = React.useMemo(() => {
    const now = Date.now();
    const cutoff = now - chartConfig.windowMs;
    if (chartConfig.marketHistory && marketChartPoints.length > 0) {
      const filtered = marketChartPoints.filter((point) => point.ts >= cutoff);
      const source = filtered.length > 0 ? filtered : marketChartPoints;
      return source.map((point) => ({
        time: formatChartLabel(point.ts),
        price: point.price,
      }));
    }
    const filteredLive = liveChartPoints.filter((point) => point.ts >= cutoff);
    const source =
      filteredLive.length > 0
        ? filteredLive
        : spotPrice && Number.isFinite(spotPrice) && spotPrice > 0
          ? [{ ts: now, price: spotPrice }]
          : [];
    return source.map((point) => ({
      time: formatChartLabel(point.ts),
      price: point.price,
    }));
  }, [chartConfig.marketHistory, chartConfig.windowMs, formatChartLabel, liveChartPoints, marketChartPoints, spotPrice]);

  const candleSeries = React.useMemo(
    () =>
      buildCandles(liveChartPoints, chartTimeframe, Date.now(), {
        windowMs: chartConfig.windowMs,
        formatLabel: formatChartLabel,
      }),
    [chartConfig.windowMs, chartTimeframe, formatChartLabel, liveChartPoints]
  );

  const activeChartPointCount = chartMode === "candle" ? candleSeries.length : lineChartSeries.length;
  const hasInsufficientCandleData = chartMode === "candle" && candleSeries.length < 2;

  const chartLatestPrice =
    chartMode === "candle"
      ? candleSeries.length
        ? candleSeries[candleSeries.length - 1].close
        : null
      : lineChartSeries.length
        ? lineChartSeries[lineChartSeries.length - 1].price
        : null;

  const chartChangePct = React.useMemo(() => {
    if (chartMode === "candle") {
      if (candleSeries.length < 2) return 0;
      const first = candleSeries[0].close;
      const last = candleSeries[candleSeries.length - 1].close;
      if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) return 0;
      return ((last - first) / first) * 100;
    }

    if (lineChartSeries.length < 2) return 0;
    const first = lineChartSeries[0].price;
    const last = lineChartSeries[lineChartSeries.length - 1].price;
    if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) return 0;
    return ((last - first) / first) * 100;
  }, [candleSeries, chartMode, lineChartSeries]);

  const chartStartLabel =
    chartMode === "candle"
      ? candleSeries.length
        ? candleSeries[0].label
        : "--"
      : lineChartSeries.length
        ? lineChartSeries[0].time
        : "--";

  const chartEndLabel =
    chartMode === "candle"
      ? candleSeries.length
        ? candleSeries[candleSeries.length - 1].label
        : "--"
      : lineChartSeries.length
        ? lineChartSeries[lineChartSeries.length - 1].time
        : "--";

  useEffect(() => {
    const historyConfig = chartConfig.marketHistory;
    if (!historyConfig) {
      setMarketChartPoints([]);
      setChartError(null);
      setChartLoading(false);
      return;
    }

    let cancelled = false;
    const loadHistory = async () => {
      setChartLoading(true);
      setChartError(null);
      try {
        const history = await PriceService.getHistory("stellar", historyConfig);
        if (cancelled) return;
        const normalized = history
          .map((point) => ({
            ts: point.timestamp,
            price: point.price,
          }))
          .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.price) && point.price > 0);
        setMarketChartPoints(normalized);
      } catch (error) {
        if (cancelled) return;
        console.error("[Swap] Failed to load chart history:", error);
        setMarketChartPoints([]);
        setChartError("History unavailable");
      } finally {
        if (!cancelled) {
          setChartLoading(false);
        }
      }
    };

    void loadHistory();
    const interval = setInterval(() => {
      void loadHistory();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chartConfig.marketHistory]);

  useEffect(() => {
    return () => {
      if (successStatusTimerRef.current) {
        clearTimeout(successStatusTimerRef.current);
      }
    };
  }, []);

  const setLifecycleStatus = React.useCallback(
    async (nextStatus: SwapStatus, message: string) => {
      lifecycleQueueRef.current = lifecycleQueueRef.current.then(async () => {
        const now = Date.now();
        const elapsed = now - lastLifecycleAtRef.current;
        if (lastLifecycleAtRef.current !== 0 && elapsed < 1000) {
          await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
        }

        // While success banner is pinned, ignore stale queued lifecycle updates.
        if (Date.now() < successStatusUntilRef.current && nextStatus !== "error") {
          return;
        }

        if (nextStatus === "error") {
          successStatusUntilRef.current = 0;
          if (successStatusTimerRef.current) {
            clearTimeout(successStatusTimerRef.current);
            successStatusTimerRef.current = null;
          }
        }

        setStatus(nextStatus);
        setStatusMessage(message);
        lastLifecycleAtRef.current = Date.now();
      });

      await lifecycleQueueRef.current;
    },
    []
  );

  const setSuccessWithMinimumVisibility = React.useCallback((message: string) => {
    successStatusUntilRef.current = Date.now() + SUCCESS_STATUS_MIN_MS;
    setStatus("success");
    setStatusMessage(message);

    if (successStatusTimerRef.current) {
      clearTimeout(successStatusTimerRef.current);
    }

    successStatusTimerRef.current = setTimeout(() => {
      successStatusUntilRef.current = 0;
      setStatus((current) => (current === "success" ? "ready" : current));
      setStatusMessage((current) => (current === message ? "" : current));
      successStatusTimerRef.current = null;
    }, SUCCESS_STATUS_MIN_MS);
  }, []);

  const applyTotalSlippageToOut = React.useCallback(
    (quotedOut: bigint) => {
      const userSlippageBps = BigInt(Math.floor(slippage * 100));
      const totalSlippageBps = userSlippageBps + QUOTE_ESTIMATE_BUFFER_BPS;
      const appliedSlippageBps =
        totalSlippageBps > MAX_TOTAL_SLIPPAGE_BPS ? MAX_TOTAL_SLIPPAGE_BPS : totalSlippageBps;
      return (quotedOut * (BigInt(10000) - appliedSlippageBps)) / BigInt(10000);
    },
    [slippage]
  );

  const autoAddTokenToFreighter = React.useCallback(
    async (contractId: string) => {
      if (!contractId) return;
      if (walletType?.toLowerCase() !== "freighter") return;

      try {
        const result = await addToken({
          contractId,
          networkPassphrase: "Test SDF Network ; September 2015",
        });
        if (result.error) {
          console.warn("[Swap] Freighter auto-add token returned error:", result.error);
        }
      } catch (error) {
        console.warn("[Swap] Freighter auto-add token failed:", error);
      }
    },
    [walletType]
  );

  const fetchBalances = React.useCallback(async () => {
    if (!address) return;
    try {
      const [xlmBal, usdcBal] = await Promise.all([
        getTokenBalance(CONTRACT_IDS.xlm, address),
        getTokenBalance(CONTRACT_IDS.usdc, address),
      ]);

      setBalances({
        XLM: (Number(xlmBal) / 10 ** 7).toFixed(2),
        USDC: (Number(usdcBal) / 10 ** 7).toFixed(2),
      });
      setBalanceStroops({
        XLM: BigInt(xlmBal),
        USDC: BigInt(usdcBal),
      });
    } catch (e) {
      console.error("Balance fetch failed", e);
    }
  }, [address, getTokenBalance]);

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [address, getTokenBalance, fetchBalances]);

  const fetchSpotPrice = React.useCallback(async () => {
    const state = await getPoolState(CONTRACT_IDS.xlm_usdc_pool);
    if (!state) return;
    try {
      const rawPrice = priceFromTick(state.currentTick);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) return;
      // priceFromTick is token1/token0; convert to USDC per XLM for display/quotes.
      const usdcPerXlm = state.token0 === CONTRACT_IDS.usdc ? 1 / rawPrice : rawPrice;
      setSpotPrice(usdcPerXlm);
      appendLiveChartPoint(usdcPerXlm);
    } catch (e) {
      console.error("Failed to fetch spot price", e);
    }
  }, [appendLiveChartPoint, getPoolState]);

  useEffect(() => {
    fetchSpotPrice();
    const interval = setInterval(fetchSpotPrice, spotPollMs);
    return () => clearInterval(interval);
  }, [fetchSpotPrice, spotPollMs]);

  const swapTokens = () => {
    const temp = token0;
    setToken0(token1);
    setToken1(temp);
    setAmountIn(amountOut);
    setAmountOut("");
    setPricing(null);
  };

  useEffect(() => {
    const getQuote = async () => {
      if (Date.now() < successStatusUntilRef.current) {
        return;
      }

      const amountInStroops = parseTokenAmountToStroops(amountIn);
      if (!address || !amountInStroops || amountInStroops <= BigInt(0)) {
        setAmountOut("");
        setPricing(null);
        setStatus("idle");
        setStatusMessage("");
        return;
      }

      if (amountInStroops > (balanceStroops[token0] ?? BigInt(0))) {
        setAmountOut("");
        setPricing(null);
        setStatus("error");
        setStatusMessage(t("swap.status.insufficientBalance"));
        return;
      }

      setStatus("quoting");
      setStatusMessage(t("swap.status.fetchingQuote"));

      try {
        let usdcPerXlm = spotPrice ?? Number.NaN;
        if (!Number.isFinite(usdcPerXlm) || usdcPerXlm <= 0) {
          const state = await getPoolState(CONTRACT_IDS.xlm_usdc_pool);
          if (!state) {
            setAmountOut("");
            setStatus("error");
            setStatusMessage(t("swap.status.poolNotFound"));
            return;
          }

          const rawPrice = priceFromTick(state.currentTick);
          if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
            setAmountOut("");
            setStatus("error");
            setStatusMessage(t("swap.status.outputUnknown"));
            return;
          }

          // priceFromTick is token1/token0; convert to USDC per XLM for display/quotes.
          usdcPerXlm = state.token0 === CONTRACT_IDS.usdc ? 1 / rawPrice : rawPrice;
          setSpotPrice(usdcPerXlm);
        }

        if (!Number.isFinite(usdcPerXlm) || usdcPerXlm <= 0) {
          setAmountOut("");
          setStatus("error");
          setStatusMessage(t("swap.status.outputUnknown"));
          return;
        }

        const spotExecPrice = token0 === "XLM" ? usdcPerXlm : 1 / usdcPerXlm;
        const inAmount = Number(amountInStroops) / 10 ** Number(TOKEN_DECIMALS);
        const spotOutEstimate = inAmount * spotExecPrice;
        if (!Number.isFinite(spotOutEstimate) || spotOutEstimate <= 0) {
          setAmountOut("");
          setStatus("error");
          setStatusMessage(t("swap.status.outputUnknown"));
          return;
        }
        const spotOutStroops = BigInt(
          Math.floor(spotOutEstimate * 10 ** Number(TOKEN_DECIMALS))
        );
        const tokenInAddress = token0 === "XLM" ? CONTRACT_IDS.xlm : CONTRACT_IDS.usdc;
        const tokenOutAddress = token1 === "USDC" ? CONTRACT_IDS.usdc : CONTRACT_IDS.xlm;

        if (spotOutStroops <= BigInt(0)) {
          setAmountOut("");
          setStatus("error");
          setStatusMessage(t("swap.status.insufficientLiquidity"));
          return;
        }

        const [poolInputBalanceRaw, poolOutputBalanceRaw, quotedOutFromQuoter] = await Promise.all([
          getTokenBalance(tokenInAddress, CONTRACT_IDS.xlm_usdc_pool),
          getTokenBalance(tokenOutAddress, CONTRACT_IDS.xlm_usdc_pool),
          quoteExactInput
            ? quoteExactInput({
              poolAddress: CONTRACT_IDS.xlm_usdc_pool,
              tokenIn: tokenInAddress,
              tokenOut: tokenOutAddress,
              fee: 3000,
              amountIn: amountInStroops,
            })
            : Promise.resolve(null),
        ]);
        const poolInputBalance = poolInputBalanceRaw ? BigInt(poolInputBalanceRaw) : BigInt(0);
        const poolOutputBalance = poolOutputBalanceRaw ? BigInt(poolOutputBalanceRaw) : BigInt(0);
        if (poolOutputBalance <= BigInt(0)) {
          setAmountOut("");
          setPricing(null);
          setStatus("error");
          setStatusMessage(t("swap.status.insufficientLiquidity"));
          return;
        }

        let outStroops =
          quotedOutFromQuoter && quotedOutFromQuoter > BigInt(0)
            ? quotedOutFromQuoter
            : BigInt(0);
        let impactBps = BigInt(0);

        // Fallback when quoter is unavailable: estimate impact from input depth.
        if (outStroops <= BigInt(0)) {
          if (poolInputBalance > BigInt(0)) {
            impactBps = (amountInStroops * BPS_DENOMINATOR) / (poolInputBalance + amountInStroops);
          }
          outStroops = (spotOutStroops * (BPS_DENOMINATOR - impactBps)) / BPS_DENOMINATOR;
        }

        if (quotedOutFromQuoter && quotedOutFromQuoter > BigInt(0) && spotOutStroops > outStroops) {
          impactBps = ((spotOutStroops - outStroops) * BPS_DENOMINATOR) / spotOutStroops;
        }
        if (impactBps > MAX_QUOTE_IMPACT_BPS) {
          impactBps = MAX_QUOTE_IMPACT_BPS;
        }

        if (outStroops <= BigInt(0) || outStroops > poolOutputBalance) {
          setAmountOut("");
          setPricing(null);
          setStatus("error");
          setStatusMessage(t("swap.status.insufficientLiquidity"));
          return;
        }

        const execPrice = Number(outStroops) / Number(amountInStroops);
        const minOutStroops = applyTotalSlippageToOut(outStroops);
        const priceImpact = Number(impactBps) / 100;

        setAmountOut(formatStroopsToToken(outStroops));

        setPricing({
          price: t("swap.pricing.executionPriceFormat", {
            base: token0,
            quote: token1,
            price: execPrice.toFixed(4),
          }),
          minOutput: t("swap.pricing.minOutputFormat", {
            amount: formatStroopsToToken(minOutStroops),
            token: token1,
          }),
          priceImpact,
        });
        setStatus("ready");
        setStatusMessage("");
      } catch (e: unknown) {
        console.error("Quote failed", e);
        setAmountOut("");
        setStatus("error");
        const errorMessage = e instanceof Error ? e.message : "Unknown error";
        if (errorMessage.includes("Pool not found")) {
          setStatusMessage(t("swap.status.poolNotFound"));
        } else if (errorMessage.includes("Insufficient")) {
          setStatusMessage(t("swap.status.insufficientLiquidity"));
        } else {
          setStatusMessage(
            t("swap.status.quoteFailedWithError", {
              error: errorMessage.substring(0, 50),
            })
          );
        }
      }
    };

    const timeoutId = setTimeout(getQuote, 500);
    return () => clearTimeout(timeoutId);
  }, [
    amountIn,
    token0,
    token1,
    address,
    getPoolState,
    getTokenBalance,
    quoteExactInput,
    t,
    balanceStroops,
    applyTotalSlippageToOut,
    spotPrice,
  ]);

  const handleSwap = async () => {
    if (!router || !address) {
      setStatus("error");
      setStatusMessage(t("swap.status.connectWallet"));
      return;
    }

    if (!amountIn || !amountOut) {
      setStatus("error");
      setStatusMessage(t("swap.status.enterAmount"));
      return;
    }

    try {
      const amount = parseTokenAmountToStroops(amountIn);
      if (!amount || amount <= BigInt(0)) {
        setStatus("error");
        setStatusMessage(t("swap.status.enterAmount"));
        return;
      }

      if (amount > (balanceStroops[token0] ?? BigInt(0))) {
        setStatus("error");
        setStatusMessage(t("swap.status.insufficientBalance"));
        return;
      }

      successStatusUntilRef.current = 0;
      if (successStatusTimerRef.current) {
        clearTimeout(successStatusTimerRef.current);
        successStatusTimerRef.current = null;
      }

      lifecycleQueueRef.current = Promise.resolve();
      lastLifecycleAtRef.current = 0;
      hasShownSubmittedRef.current = false;
      hasShownConfirmingRef.current = false;

      const tokenInAddress = token0 === "XLM" ? CONTRACT_IDS.xlm : CONTRACT_IDS.usdc;
      const tokenOutAddress = token1 === "USDC" ? CONTRACT_IDS.usdc : CONTRACT_IDS.xlm;
      const successOutDisplay = amountOut;

      await setLifecycleStatus("approving", t("swap.status.checkingAllowance"));

      const currentAllowance = await checkAllowance(
        tokenInAddress,
        address,
        CONTRACT_IDS.xlm_usdc_pool
      );

      if (currentAllowance < amount) {
        await setLifecycleStatus("approving", t("swap.status.approvingToken"));
        await approveToken(tokenInAddress, CONTRACT_IDS.xlm_usdc_pool, amount * BigInt(2));
        await setLifecycleStatus("approving", t("swap.status.approvalConfirmed"));
      }

      await setLifecycleStatus("swapping", t("swap.status.preparingSwap"));

      const path = [
        {
          token_in: tokenInAddress,
          token_out: tokenOutAddress,
          fee: 3000,
        },
      ];

      const quotedOut = parseTokenAmountToStroops(amountOut) ?? BigInt(0);
      const minOutForTx = applyTotalSlippageToOut(quotedOut);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

      const tx = await router.swap_exact_input({
        path,
        amount_in: amount,
        amount_out_minimum: minOutForTx,
        payer: address,
        recipient: address,
        deadline,
        sqrt_price_limit_x96: [BigInt(0), BigInt(0)],
      });

      await setLifecycleStatus("swapping", t("swap.status.signInWallet"));

      try {
        await tx.signAndSend({
          watcher: {
            onSubmitted: (response?: { hash?: string }) => {
              if (!hasShownSubmittedRef.current) {
                const txHash = response?.hash;
                const message = txHash
                  ? `Transaction submitted: ${txHash.slice(0, 8)}...${txHash.slice(-6)}`
                  : "Transaction submitted to network";
                void setLifecycleStatus("submitted", message);
                hasShownSubmittedRef.current = true;
              }
            },
            onProgress: (response?: { status?: string }) => {
              if (response?.status === "NOT_FOUND") {
                if (!hasShownConfirmingRef.current) {
                  void setLifecycleStatus("confirming", "Waiting for on-chain confirmation...");
                  hasShownConfirmingRef.current = true;
                }
                return;
              }
              if (response?.status === "FAILED") {
                void setLifecycleStatus(
                  "error",
                  t("swap.status.swapFailedWithError", { error: "On-chain execution failed" })
                );
              }
            },
          },
        });
        setSuccessWithMinimumVisibility(
          t("swap.status.swapSuccess", { amount: successOutDisplay, token: token1 })
        );
        void autoAddTokenToFreighter(tokenOutAddress);
        await fetchBalances();
        setAmountIn("");
        setAmountOut("");
        setPricing(null);
      } catch (sendError: unknown) {
        const errorMsg = sendError instanceof Error ? sendError.message : "";
        if (errorMsg.startsWith("BLUX_ALREADY_SUBMITTED:")) {
          const txHash = errorMsg.split(":")[1];
          if (txHash) {
            await setLifecycleStatus("submitted", `Transaction submitted: ${txHash.slice(0, 8)}...${txHash.slice(-6)}`);
            await setLifecycleStatus("confirming", "Waiting for on-chain confirmation...");
          }
          setSuccessWithMinimumVisibility(
            t("swap.status.swapSuccess", { amount: successOutDisplay, token: token1 })
          );
          void autoAddTokenToFreighter(tokenOutAddress);
          await fetchBalances();
          setAmountIn("");
          setAmountOut("");
          setPricing(null);
          return;
        }
        throw sendError;
      }
    } catch (e: unknown) {
      console.error("Swap failed", e);
      successStatusUntilRef.current = 0;
      if (successStatusTimerRef.current) {
        clearTimeout(successStatusTimerRef.current);
        successStatusTimerRef.current = null;
      }
      setStatus("error");
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      const normalizedError = errorMessage.toLowerCase();

      if (errorMessage.includes("exceeds") || errorMessage.includes("footprint") || errorMessage.includes("ExceededLimit")) {
        setStatusMessage(t("swap.status.exceededLimits"));
      } else if (normalizedError.includes("insufficient output amount")) {
        setStatusMessage(t("swap.status.slippageTooLow"));
      } else if (
        normalizedError.includes("insufficient pool token0 balance") ||
        normalizedError.includes("insufficient pool token1 balance") ||
        (
          normalizedError.includes("invalidaction") &&
          normalizedError.includes("contract call failed") &&
          normalizedError.includes("transfer")
        )
      ) {
        setStatusMessage(t("swap.status.insufficientLiquidity"));
      } else if (errorMessage.includes("rejected") || errorMessage.includes("cancelled")) {
        setStatusMessage(t("swap.status.rejected"));
      } else if (errorMessage.includes("insufficient balance") || errorMessage.includes("balance")) {
        setStatusMessage(t("swap.status.insufficientBalance"));
      } else {
        setStatusMessage(
          t("swap.status.swapFailedWithError", {
            error: errorMessage.substring(0, 100),
          })
        );
      }
    }
  };

  const getButtonText = () => {
    switch (status) {
      case "quoting":
        return t("swap.button.gettingQuote");
      case "approving":
        return t("swap.button.approving");
      case "swapping":
        return t("swap.button.executing");
      case "submitted":
      case "confirming":
        return t("swap.button.executing");
      case "success":
        return t("swap.button.success");
      case "error":
        return t("swap.button.retry");
      default:
        return t("swap.button.execute");
    }
  };

  const parsedAmountIn = parseTokenAmountToStroops(amountIn);
  const insufficientInputBalance =
    parsedAmountIn !== null && parsedAmountIn > (balanceStroops[token0] ?? BigInt(0));

  const isButtonDisabled = () =>
    status === "quoting" ||
    status === "approving" ||
    status === "swapping" ||
    status === "submitted" ||
    status === "confirming" ||
    parsedAmountIn === null ||
    parsedAmountIn <= BigInt(0) ||
    insufficientInputBalance ||
    !amountIn ||
    !amountOut ||
    status === "success";

  const statusStyle =
    status === "error"
      ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
      : status === "success"
        ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
        : "border-[var(--accent)]/40 text-[var(--accent)] bg-[var(--accent)]/10";

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12 } },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 lg:flex lg:h-full lg:flex-col lg:space-y-2 lg:pb-1"
    >
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        slippage={slippage}
        setSlippage={setSlippage}
      />

      <motion.div variants={fadeUp} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-3">
        <div className="space-y-2 lg:space-y-2">
          <span className="lux-pill border-[var(--accent)] text-[var(--accent)]">
            {t("swap.badge")}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-[20px]">
            {t("swap.title")}
          </h1>
          <p className="text-sm text-[var(--muted)] lg:text-[11px]">
            {t("swap.subtitle")}
          </p>
        </div>
        <div className="w-full lg:ml-auto lg:w-auto lg:min-w-[230px] lg:flex lg:flex-col lg:items-end">
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`lux-pill mb-2 w-full min-w-0 overflow-hidden px-2 py-1 lg:max-w-[300px] ${statusStyle}`}
              >
                {status === "error" && <AlertCircle size={12} />}
                {status === "success" && <CheckCircle size={12} />}
                {(status === "quoting" ||
                  status === "swapping" ||
                  status === "approving" ||
                  status === "submitted" ||
                  status === "confirming") && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                <span className="min-w-0 truncate text-[9px] tracking-[0.12em]">
                  {statusMessage}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("swap.settings.button")}
            className="lux-button flex w-full items-center justify-center gap-2 lg:w-auto lg:self-end lg:px-3 lg:py-2"
          >
            <Settings size={14} />
            {t("swap.settings.button")}
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid min-w-0 gap-5 lg:min-h-0 lg:flex-1 lg:gap-2 lg:grid-cols-[1.35fr_0.65fr]">
        <section
          data-testid="swap-trade-panel"
          className="order-1 min-w-0 space-y-3 lg:order-2 lg:h-full lg:space-y-0 lg:flex lg:flex-col lg:gap-2"
        >
          <div className="lux-card min-w-0 w-full max-w-full overflow-hidden p-5 max-[375px]:p-4 sm:p-6 md:p-7 lg:p-2.5 space-y-5 lg:space-y-1.5 lg:shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <Zap size={14} />
                <span className="text-[10px] uppercase tracking-[0.3em]">{t("swap.version")}</span>
              </div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                {t("swap.feeLabel", { fee: "0.3%" })}
              </span>
            </div>

            <div className="space-y-3 lg:space-y-1.5">
              <div className="flex min-w-0 items-center justify-between text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] max-[375px]:text-[9px] max-[375px]:tracking-[0.2em] lg:text-[9px] lg:tracking-[0.22em]">
                <span>{t("swap.sell")}</span>
                <span>{t("swap.balance", { balance: preciseBalances[token0] })}</span>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:gap-1.5 lg:p-2">
                <label htmlFor="swap-amount-in" className="sr-only">
                  {t("swap.sell")}
                </label>
                <NumberField
                  id="swap-amount-in"
                  name="swap-amount-in"
                  value={amountIn}
                  onChange={setAmountIn}
                  placeholder="0.00"
                  step={0.01}
                  variant="plain"
                  inputClassName="text-2xl font-semibold sm:text-3xl lg:text-[20px]"
                />
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setAmountIn(formatStroopsToToken(balanceStroops[token0] ?? BigInt(0)))}
                    aria-label={t("swap.max")}
                    className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] max-[375px]:text-[9px] max-[375px]:tracking-[0.2em] lg:text-[9px] lg:tracking-[0.22em]"
                  >
                    {t("swap.max")}
                  </button>
                  <button
                    type="button"
                    aria-label={`Sell token ${token0}`}
                    className="flex w-full min-w-0 items-center justify-between gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[var(--foreground)] max-[375px]:text-[9px] max-[375px]:tracking-[0.15em] sm:w-auto sm:justify-center sm:px-4 sm:text-xs sm:tracking-[0.3em]"
                  >
                    <span className="min-w-0 truncate">{token0}</span>
                    <ChevronDown size={12} className="text-[var(--muted)]" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-center lg:py-0">
              <button
                type="button"
                onClick={swapTokens}
                aria-label="Swap token direction"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] transition-all hover:border-[var(--accent)] lg:h-9 lg:w-9"
              >
                <ArrowDown size={16} />
              </button>
            </div>

            <div className="space-y-3 lg:space-y-1.5">
              <div className="flex min-w-0 items-center justify-between text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] max-[375px]:text-[9px] max-[375px]:tracking-[0.2em] lg:text-[9px] lg:tracking-[0.22em]">
                <span>{t("swap.buy")}</span>
                <span>{t("swap.balance", { balance: preciseBalances[token1] })}</span>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 lg:gap-1.5 lg:p-2">
                <div className="text-2xl font-semibold text-[var(--foreground)] sm:text-3xl lg:text-[20px]">
                  {status === "quoting" ? (
                    <span className="text-base text-[var(--muted)]">{t("general.loadingEllipsis")}</span>
                  ) : (
                    amountOut || "0.00"
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    aria-label={`Buy token ${token1}`}
                    className="flex w-full min-w-0 items-center justify-between gap-2 rounded-full border border-[var(--accent)] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[var(--accent)] max-[375px]:text-[9px] max-[375px]:tracking-[0.15em] sm:w-auto sm:justify-center sm:px-4 sm:text-xs sm:tracking-[0.3em]"
                  >
                    <span className="min-w-0 truncate">{token1}</span>
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              aria-label={getButtonText()}
              disabled={isButtonDisabled()}
              className="lux-button-primary w-full disabled:opacity-40 disabled:hover:transform-none lg:py-1.5"
            >
              {getButtonText()}
            </button>
          </div>

          <div className="grid gap-3 lg:gap-2 lg:grid-cols-2 lg:flex-1 lg:min-h-0">
            <div className="lux-card h-full p-5 lg:min-h-0 lg:p-2.5 flex flex-col overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                {t("swap.pricing.title")}
              </p>
              {pricing ? (
                <>
                  <div className="mt-2 space-y-1.5">
                    <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-sm lg:text-[11px]">
                      <span className="text-[var(--muted)] whitespace-nowrap">{t("swap.pricing.executionPrice")}</span>
                      <span className="min-w-0 text-right font-semibold leading-tight">
                        {pricing.price}
                      </span>
                    </div>
                    <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-sm lg:text-[11px]">
                      <span className="text-[var(--muted)] whitespace-nowrap">{t("swap.pricing.minReceived")}</span>
                      <span className="min-w-0 text-right font-semibold leading-tight text-[var(--accent)]">
                        {pricing.minOutput}
                      </span>
                    </div>
                    <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-sm lg:text-[11px]">
                      <span className="text-[var(--muted)] whitespace-nowrap">{t("swap.pricing.priceImpact")}</span>
                      <span
                        className={`text-right font-semibold ${pricing.priceImpact > 10
                          ? "text-rose-500"
                          : pricing.priceImpact > 5
                            ? "text-amber-500"
                            : "text-[var(--accent)]"
                          }`}
                      >
                        {pricing.priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-6 shrink-0">
                    {pricing.priceImpact > 10 && (
                      <div className="h-full w-full rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 text-center text-[8px] uppercase tracking-[0.2em] leading-[22px] text-rose-500">
                        {t("swap.pricing.highImpactWarning")}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-2 flex-1 px-1">
                  <p className="text-sm leading-snug text-[var(--muted)] lg:text-[11px]">
                    {t("swap.pricing.empty")}
                  </p>
                </div>
              )}
            </div>

            <div className="lux-card h-full p-5 lg:min-h-0 lg:p-2.5 flex flex-col overflow-hidden">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                {t("swap.wallet.title")}
              </p>
              <div className="mt-2 space-y-1.5">
                <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-sm lg:text-[11px]">
                  <span className="text-[var(--muted)] whitespace-nowrap">{t("swap.wallet.xlmBalance")}</span>
                  <span className="text-right font-semibold">{balances.XLM}</span>
                </div>
                <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-sm lg:text-[11px]">
                  <span className="text-[var(--muted)] whitespace-nowrap">{t("swap.wallet.usdcBalance")}</span>
                  <span className="text-right font-semibold">{balances.USDC}</span>
                </div>
                <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2 text-sm lg:text-[11px]">
                  <span className="text-[var(--muted)] whitespace-nowrap">{t("swap.wallet.spotPrice")}</span>
                  <span className="text-right font-semibold">
                    {spotPrice ? `${spotPrice.toFixed(4)} USDC/XLM` : t("general.loading")}
                  </span>
                </div>
              </div>
            </div>

            {!address && (
              <div className="lux-card p-5 text-xs text-[var(--muted)] lg:col-span-2 lg:p-2.5 lg:text-[11px]">
                {t("swap.wallet.connectPrompt")}
              </div>
            )}
          </div>
        </section>

        <section data-testid="swap-chart-panel" className="order-2 min-w-0 lg:order-1 lg:min-h-0">
          <div className="lux-card h-[360px] sm:h-[420px] lg:h-full p-5 lg:p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                {t("swap.chart.title")}
              </p>
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.25em] ${chartChangePct >= 0 ? "text-[var(--accent)]" : "text-rose-500"
                  }`}
              >
                {activeChartPointCount > 1 ? `${chartChangePct >= 0 ? "+" : ""}${chartChangePct.toFixed(2)}%` : "--"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center rounded-full border border-[var(--border)] p-0.5">
                <button
                  type="button"
                  onClick={() => setChartMode("line")}
                  className={`rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] transition-colors ${chartMode === "line"
                    ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                >
                  {t("swap.chart.mode.line")}
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("candle")}
                  className={`rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] transition-colors ${chartMode === "candle"
                    ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                >
                  {t("swap.chart.mode.candle")}
                </button>
              </div>

              {CHART_TIMEFRAME_ORDER.map((frame) => (
                <button
                  key={frame}
                  type="button"
                  onClick={() => setChartTimeframe(frame)}
                  className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] transition-colors ${chartTimeframe === frame
                    ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                >
                  {frame}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-[210px] rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-2">
              {chartMode === "candle" ? (
                hasInsufficientCandleData ? (
                  <div className="flex h-full items-center justify-center text-center text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    {t("swap.chart.insufficientData", { window: chartTimeframe })}
                  </div>
                ) : (
                  <CandlestickChart id={`swap-${chartTimeframe}`} data={candleSeries} />
                )
              ) : chartError ? (
                <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[0.2em] text-rose-500">
                  {chartError}
                </div>
              ) : chartLoading && lineChartSeries.length === 0 ? (
                <div className="w-full h-full bg-white/5 animate-pulse rounded-lg" />
              ) : (
                <PriceChart id={`swap-${chartTimeframe}`} color="#b08d57" data={lineChartSeries} />
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-[var(--muted)] lg:text-[9px]">
              <span>{chartStartLabel}</span>
              <span className="font-semibold text-[var(--foreground)]">
                {chartLatestPrice ? `${chartLatestPrice.toFixed(4)} USDC/XLM` : "--"}
              </span>
              <span>{chartEndLabel}</span>
            </div>
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
};
