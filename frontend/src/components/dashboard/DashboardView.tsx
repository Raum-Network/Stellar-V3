"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  Terminal,
  TrendingUp,
  ArrowDownRight,
  RefreshCcw,
} from "lucide-react";
import { motion } from "framer-motion";
import { PriceChart } from "./PriceChart";
import { useStellar } from "@/context/StellarContext";
import { CONTRACT_IDS } from "@/contracts/config";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useI18n } from "@/context/I18nContext";
import { priceFromTick } from "@/utils/price";

const LOG_HISTORY_LIMIT = 13;
const DESKTOP_LOG_ROWS = 13;
const MOBILE_LOG_ROWS = 13;
const SPEED_BARS = 8;
const SYNC_STALE_WINDOW_MS = 30_000;

const StatusBadge = ({
  label,
  status,
  withBorder = true,
}: {
  label: string;
  status: string;
  withBorder?: boolean;
}) => (
  <div className={`flex items-center justify-between pb-3 text-[10px] uppercase tracking-[0.3em] lg:pb-2 lg:text-[9px] lg:tracking-[0.25em] ${withBorder ? "border-b border-[var(--border)]" : ""}`}>
    <span className="text-[var(--muted)]">{label}</span>
    <span className="text-[var(--accent)]">{status}</span>
  </div>
);

const formatCompact = (value: number) => {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
};

const formatToken = (value: bigint | null, symbol: string, decimals: number = 7) => {
  if (value === null) return `-- ${symbol}`;
  const scaled = Number(value) / 10 ** decimals;
  return `${formatCompact(scaled)} ${symbol}`;
};

const formatUsd = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "--";
  return `$${formatCompact(value)}`;
};

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export const DashboardView = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const isDesktop = useIsDesktop();
  const displayLogs = logs.slice(0, isDesktop ? DESKTOP_LOG_ROWS : MOBILE_LOG_ROWS);
  const { positionManager, getPoolState, getTokenBalance, address, latestLedger } = useStellar();
  const { t, language } = useI18n();
  const [poolState, setPoolState] = useState<{
    liquidity: bigint;
    currentTick: number;
    fee: number;
    feesUncollected0: bigint;
    feesUncollected1: bigint;
    token0: string;
    token1: string;
  } | null>(null);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [activeLiquidityUsd, setActiveLiquidityUsd] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ time: string; price: number }[]>([]);
  const [totalPositions, setTotalPositions] = useState<number | null>(null);
  const [ownedPositions, setOwnedPositions] = useState<number | null>(null);
  const [ledgerSpeedSec, setLedgerSpeedSec] = useState<number | null>(null);
  const [rpcLatencyMs, setRpcLatencyMs] = useState<number | null>(null);
  const [syncPercent, setSyncPercent] = useState<number | null>(null);
  const [lastLedgerUpdateMs, setLastLedgerUpdateMs] = useState<number | null>(null);
  const previousLedgerSample = React.useRef<{ sequence: number; timestamp: number } | null>(null);
  const addLog = React.useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString(language, { hour12: false });
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev].slice(0, LOG_HISTORY_LIMIT));
  }, [language]);

  const recordPrice = React.useCallback((price: number) => {
    setPriceHistory((prev) => {
      const next = [
        ...prev,
        {
          time: new Date().toLocaleTimeString(language, {
            hour: "2-digit",
            minute: "2-digit",
          }),
          price,
        },
      ];
      return next.slice(-20);
    });
  }, [language]);

  const computeSpotPrice = React.useCallback((state: {
    currentTick: number;
    token0: string;
  }) => {
    const rawPrice = priceFromTick(state.currentTick);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;
    // priceFromTick is token1/token0; normalize to USDC per XLM.
    if (state.token0 === CONTRACT_IDS.usdc) {
      return 1 / rawPrice;
    }
    return rawPrice;
  }, []);

  const fetchAllData = React.useCallback(async () => {
    let latestPrice: number | null = null;
    let nextActiveLiquidityUsd: number | null = null;
    let nextTotalPositions: number | null = null;
    let nextOwnedPositions: number | null = null;
    try {
      const latencyStartMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const state = await getPoolState(CONTRACT_IDS.xlm_usdc_pool);
      const latencyEndMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const measuredLatency = Math.max(1, Math.round(latencyEndMs - latencyStartMs));
      setRpcLatencyMs(measuredLatency);
      if (state) {
        setPoolState({
          liquidity: state.liquidity,
          currentTick: state.currentTick,
          fee: state.fee,
          feesUncollected0: state.feesUncollected0,
          feesUncollected1: state.feesUncollected1,
          token0: state.token0,
          token1: state.token1,
        });
      }

      if (state) {
        const price = computeSpotPrice({
          currentTick: state.currentTick,
          token0: state.token0,
        });
        if (price !== null) {
          setSpotPrice(price);
          recordPrice(price);
          latestPrice = price;

          // Active liquidity in USD:
          // USDC/USD assumed 1:1 and XLM/USD derived from pool price (USDC per XLM).
          const [poolToken0Raw, poolToken1Raw] = await Promise.all([
            getTokenBalance(state.token0, CONTRACT_IDS.xlm_usdc_pool),
            getTokenBalance(state.token1, CONTRACT_IDS.xlm_usdc_pool),
          ]);
          const token0Amount = Number(BigInt(poolToken0Raw)) / 10 ** 7;
          const token1Amount = Number(BigInt(poolToken1Raw)) / 10 ** 7;

          const token0IsUsdc = state.token0 === CONTRACT_IDS.usdc;
          const token1IsUsdc = state.token1 === CONTRACT_IDS.usdc;
          const poolUsdc = token0IsUsdc
            ? token0Amount
            : token1IsUsdc
              ? token1Amount
              : token1Amount;
          const poolXlm = token0IsUsdc
            ? token1Amount
            : token1IsUsdc
              ? token0Amount
              : token0Amount;
          nextActiveLiquidityUsd = poolUsdc + poolXlm * price;
          setActiveLiquidityUsd(nextActiveLiquidityUsd);
        }
      }

      if (positionManager) {
        const totalTx = await positionManager.total_supply();
        if (totalTx.result !== undefined && totalTx.result !== null) {
          nextTotalPositions = Number(totalTx.result);
          setTotalPositions(nextTotalPositions);
        }
        if (address) {
          const ownedTx = await positionManager.balance_of({ owner: address });
          nextOwnedPositions = Number(ownedTx.result ?? 0);
          setOwnedPositions(nextOwnedPositions);
        } else {
          setOwnedPositions(null);
        }
      }

      setLoading(false);
      if (latestPrice) {
        addLog(
          t("dashboard.logs.poolSync", {
            price: latestPrice.toFixed(4),
          })
        );
      }
      if (nextActiveLiquidityUsd !== null) {
        addLog(`POOL_DEPTH: TVL ${formatUsd(nextActiveLiquidityUsd)}`);
      }
      if (state) {
        const poolToken0Symbol = state.token0 === CONTRACT_IDS.usdc ? "USDC" : "XLM";
        const poolToken1Symbol = state.token1 === CONTRACT_IDS.xlm ? "XLM" : "USDC";
        addLog(
          `FEE_BUFFER: ${formatToken(state.feesUncollected0, poolToken0Symbol)} | ${formatToken(
            state.feesUncollected1,
            poolToken1Symbol
          )}`
        );
      }
      if (nextTotalPositions !== null) {
        addLog(`NFT_SUPPLY: ${nextTotalPositions.toLocaleString()} POSITIONS`);
      }
      if (address && nextOwnedPositions !== null) {
        addLog(`WALLET_POSITIONS: ${nextOwnedPositions}`);
      }
    } catch (e) {
      console.error("Failed to fetch pool metrics", e);
      setRpcLatencyMs(null);
      setActiveLiquidityUsd(null);
    }
  }, [addLog, address, computeSpotPrice, getPoolState, getTokenBalance, positionManager, recordPrice, t]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);

    const initialLogs = [
      t("dashboard.logs.kernelInit"),
      t("dashboard.logs.secAudit"),
      t("dashboard.logs.netScan"),
      t("dashboard.logs.walletMonitor"),
    ];
    const timestamp = new Date().toLocaleTimeString(language, { hour12: false });
    const warmupLogs = Array.from({ length: 12 }, (_, i) => initialLogs[i % initialLogs.length]).reverse();
    setLogs((prev) => {
      const existing = new Set(prev);
      const toPrepend = warmupLogs
        .map((entry) => `[${timestamp}] ${entry}`)
        .filter((entry) => !existing.has(entry));
      if (!toPrepend.length) return prev;
      return [...toPrepend, ...prev].slice(0, LOG_HISTORY_LIMIT);
    });

    return () => clearInterval(interval);
  }, [fetchAllData, language, t]);

  const token0Symbol = poolState?.token0 === CONTRACT_IDS.usdc ? "USDC" : "XLM";
  const token1Symbol = poolState?.token1 === CONTRACT_IDS.xlm ? "XLM" : "USDC";
  const basePrice = priceHistory[0]?.price ?? 0;
  const latestPrice = priceHistory[priceHistory.length - 1]?.price ?? 0;
  const sessionChange =
    priceHistory.length > 1 && basePrice > 0
      ? ((latestPrice - basePrice) / basePrice) * 100
      : 0;

  useEffect(() => {
    if (typeof latestLedger !== "number" || !Number.isFinite(latestLedger)) {
      return;
    }
    setLastLedgerUpdateMs(Date.now());
  }, [latestLedger]);

  useEffect(() => {
    if (lastLedgerUpdateMs === null) {
      setSyncPercent(null);
      return;
    }

    const updateSyncPercent = () => {
      const ageMs = Date.now() - lastLedgerUpdateMs;
      const normalized = 1 - ageMs / SYNC_STALE_WINDOW_MS;
      const nextPercent = Math.max(0, Math.min(100, Math.round(normalized * 100)));
      setSyncPercent(nextPercent);
    };

    updateSyncPercent();
    const interval = setInterval(updateSyncPercent, 1000);
    return () => clearInterval(interval);
  }, [lastLedgerUpdateMs]);

  useEffect(() => {
    if (typeof latestLedger !== "number" || !Number.isFinite(latestLedger)) {
      return;
    }

    const now = Date.now();
    const previous = previousLedgerSample.current;

    if (previous && latestLedger > previous.sequence) {
      const ledgerDelta = latestLedger - previous.sequence;
      const timeDeltaSec = (now - previous.timestamp) / 1000;
      if (ledgerDelta > 0 && timeDeltaSec > 0) {
        const sample = Math.max(0.5, Math.min(15, timeDeltaSec / ledgerDelta));
        setLedgerSpeedSec((current) =>
          current === null
            ? sample
            : current * 0.7 + sample * 0.3
        );
      }
    }

    previousLedgerSample.current = {
      sequence: latestLedger,
      timestamp: now,
    };
  }, [latestLedger]);

  const activeSpeedBars =
    ledgerSpeedSec === null
      ? 0
      : Math.max(1, Math.min(SPEED_BARS, Math.round(((8 - ledgerSpeedSec) / 6) * SPEED_BARS)));
  const speedLabel = ledgerSpeedSec === null ? "--" : `${ledgerSpeedSec.toFixed(2)}s`;
  const latencyLabel = rpcLatencyMs === null ? "--" : `${rpcLatencyMs}ms`;
  const syncLabel = syncPercent === null ? "--" : `${syncPercent}%`;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 lg:space-y-4"
    >
      <motion.section variants={fadeUp} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="space-y-3">
          <span className="lux-pill border-[var(--accent)] text-[var(--accent)]">
            {t("dashboard.badge.coreMarket")}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl lg:text-2xl">
            {t("dashboard.title")}
          </h1>
          <p className="max-w-xl text-sm text-[var(--muted)] lg:text-xs">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="lux-card px-5 py-3 lg:px-4 lg:py-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
            {t("dashboard.systemStatus")}
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--foreground)] lg:text-xs">
            {t("dashboard.systemOperational")}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)] lg:text-[10px]">
            {t("dashboard.latencySync", { latency: latencyLabel, sync: syncLabel })}
          </p>
        </div>
      </motion.section>

      <motion.section variants={fadeUp} className="lux-card p-6 lg:p-4">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <TrendingUp size={14} />
              <span className="text-[10px] uppercase tracking-[0.3em]">
                {t("dashboard.poolPrice")}
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-semibold lg:text-xl">
                {spotPrice ? spotPrice.toFixed(4) : "--"}
              </span>
              <span className="text-xs text-[var(--muted)]">{t("dashboard.poolPriceUnit")}</span>
              <span
                className={`text-[10px] uppercase tracking-[0.3em] ${sessionChange >= 0 ? "text-[var(--accent)]" : "text-rose-500"
                  }`}
              >
                {t("dashboard.sessionChange", {
                  arrow: sessionChange >= 0 ? "▲" : "▼",
                  percent: Math.abs(sessionChange).toFixed(2),
                })}
              </span>
            </div>
            <div className="h-10 opacity-80">
              <PriceChart data={priceHistory} id="pool-price" color="#b08d57" />
            </div>
          </div>

          <div className="space-y-2 border-t border-[var(--border)] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <Activity size={14} />
              <span className="text-[10px] uppercase tracking-[0.3em]">
                {t("dashboard.activeLiquidity")}
              </span>
            </div>
            <p className="text-2xl font-semibold lg:text-xl">
              {formatUsd(activeLiquidityUsd)}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {t("dashboard.tickFee", {
                tick: poolState?.currentTick ?? "--",
                fee: (poolState?.fee ?? 0) / 10000,
              })}
            </p>
          </div>

          <div className="space-y-2 border-t border-[var(--border)] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <ArrowDownRight size={14} />
              <span className="text-[10px] uppercase tracking-[0.3em]">
                {t("dashboard.uncollectedFees")}
              </span>
            </div>
            <p className="text-2xl font-semibold lg:text-xl">
              {formatToken(poolState?.feesUncollected0 ?? null, token0Symbol)}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {formatToken(poolState?.feesUncollected1 ?? null, token1Symbol)}
            </p>
          </div>

          <div className="space-y-2 border-t border-[var(--border)] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <Terminal size={14} />
              <span className="text-[10px] uppercase tracking-[0.3em]">
                {t("dashboard.positionNfts")}
              </span>
            </div>
            <p className="text-2xl font-semibold lg:text-xl">
              {totalPositions !== null ? totalPositions.toLocaleString() : "--"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {address
                ? t("dashboard.yourPositions", { count: ownedPositions ?? "--" })
                : t("dashboard.connectToView")}
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp} className="grid gap-6 lg:gap-3 lg:grid-cols-3 items-stretch">
        <div className="lux-card lg:col-span-2 overflow-hidden flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 lg:px-4 lg:py-2">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-[var(--accent)]" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                {t("dashboard.systemLogs")}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500/40" />
              <span className="h-2 w-2 rounded-full bg-amber-400/40" />
              <span className="h-2 w-2 rounded-full bg-emerald-500/40" />
            </div>
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-4 lg:px-4 lg:py-2 text-sm text-[var(--muted)] lg:text-[12px]">
            {loading && !displayLogs.length ? (
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <RefreshCcw size={12} className="animate-spin" />
                <span>{t("dashboard.initializingSession")}</span>
              </div>
            ) : (
              displayLogs.map((log, i) => (
                <div key={i} className={`flex gap-3 ${i === 0 ? "text-[var(--accent)]" : ""}`}>
                  <span className="opacity-30">[{i}]</span>
                  <span className="truncate leading-snug">{log}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lux-card p-6 lg:p-4 flex flex-col gap-4 lg:gap-4 h-full">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
              {t("dashboard.subsystemHealth")}
            </p>
            <p className="mt-2 text-xl font-semibold lg:text-lg">
              {t("dashboard.networkMonitoring")}
            </p>
          </div>

          <div className="space-y-3">
            <StatusBadge label={t("dashboard.status.horizonApi")} status={t("dashboard.status.synchronized")} />
            <StatusBadge label={t("dashboard.status.validation")} status={t("dashboard.status.bftEnabled")} />
            <StatusBadge label={t("dashboard.status.security")} status={t("dashboard.status.encrypted")} />
            <StatusBadge label={t("dashboard.status.audit")} status="Internal Passed" withBorder={false} />
          </div>

          <div className="mt-auto border-t border-[var(--border)] pt-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
              {t("dashboard.networkSpeed")}
            </p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-2xl font-semibold lg:text-xl">{speedLabel}</p>
              <div className="flex gap-1">
                {Array.from({ length: SPEED_BARS }, (_, idx) => idx + 1).map((i) => (
                  <span
                    key={i}
                    className={`h-4 w-1 rounded-full lg:h-3 ${i <= activeSpeedBars ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                      }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
};
