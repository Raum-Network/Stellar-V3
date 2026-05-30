"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, TrendingUp, Layers, X, Shield, BarChart3, Zap, Trash2, DollarSign, Loader2, RefreshCw } from 'lucide-react';
import { addToken } from '@stellar/freighter-api';
import { useStellar } from '@/context/StellarContext';
import type { PoolState } from '@/context/StellarContext';
import { CONTRACT_IDS } from '@/contracts/config';
import { motion, AnimatePresence } from 'framer-motion';
import { PriceChart } from '@/components/dashboard/PriceChart';
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { NumberField } from "@/components/ui/NumberField";
import { useI18n } from "@/context/I18nContext";
import { priceFromTick } from "@/utils/price";
import {
    calcAmountsFromLiquidity,
    formatStroopsToToken,
    maxLiquidityForDesiredAmounts,
    parseTokenAmountToStroops,
} from "@/utils/clmmMath";

// Local storage key for positions
const POSITIONS_KEY = 'clmm_positions';
const FREIGHTER_ADD_TOKEN_TIMEOUT_MS = 12000;
const MAX_U32 = 4294967295;
const OWNED_TOKEN_PAGE_SIZE = 25;
const MIN_TICK = -887220;
const MAX_TICK = 887220;
const TOKEN_DECIMALS = 7;
const BI_ZERO = BigInt(0);
const BI_TWO = BigInt(2);
const STROOPS_PER_TOKEN = BigInt(10 ** TOKEN_DECIMALS);
const UNBOUNDED_U128 = BigInt("340282366920938463463374607431768211455");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * MS_PER_DAY;
const APR_TARGET_WINDOW_MS = 30 * MS_PER_DAY;
const APR_MIN_WINDOW_MS = 6 * 60 * 60 * 1000; // Require at least 6h of observed history.
const APR_SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // Keep hourly snapshots.
const APR_MAX_SNAPSHOTS = 240;
const APR_SNAPSHOT_KEY = `clmm_pool_apr_snapshots_${CONTRACT_IDS.xlm_usdc_pool}`;
type RangePreset = 'tight' | 'spot' | 'wide' | 'full' | 'custom';

const RANGE_PRESET_OPTIONS: Array<{ id: Exclude<RangePreset, 'custom'>; label: string; hint: string }> = [
    { id: 'tight', label: 'Tight', hint: '±5%' },
    { id: 'spot', label: 'Around Spot', hint: '±15%' },
    { id: 'wide', label: 'Wide', hint: '±50%' },
    { id: 'full', label: 'Full Range', hint: 'min tick → max tick' },
];

const isValidU32TokenId = (value: number): boolean =>
    Number.isInteger(value) && value >= 0 && value <= MAX_U32;

const toU32TokenId = (value: number | string | bigint): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!isValidU32TokenId(numeric)) {
        throw new Error(`Invalid token_id for u32: ${String(value)}`);
    }
    return numeric;
};

const clampTick = (tick: number): number => Math.max(MIN_TICK, Math.min(MAX_TICK, tick));

const alignTickDown = (tick: number, tickSpacing: number): number =>
    Math.floor(tick / tickSpacing) * tickSpacing;

const alignTickUp = (tick: number, tickSpacing: number): number =>
    Math.ceil(tick / tickSpacing) * tickSpacing;

const poolPriceFromUiPrice = (uiPrice: number, poolToken0: string): number =>
    poolToken0 === CONTRACT_IDS.usdc ? 1 / uiPrice : uiPrice;

const uiPriceFromPoolPrice = (poolPrice: number, poolToken0: string): number =>
    poolToken0 === CONTRACT_IDS.usdc ? 1 / poolPrice : poolPrice;

const mapPoolAmountsToUiAmounts = (
    amount0: bigint,
    amount1: bigint,
    poolToken0: string,
    poolToken1: string
): { xlm: bigint; usdc: bigint } => {
    if (poolToken0 === CONTRACT_IDS.xlm && poolToken1 === CONTRACT_IDS.usdc) {
        return { xlm: amount0, usdc: amount1 };
    }
    if (poolToken0 === CONTRACT_IDS.usdc && poolToken1 === CONTRACT_IDS.xlm) {
        return { xlm: amount1, usdc: amount0 };
    }
    return { xlm: amount0, usdc: amount1 };
};

const mapUiAmountsToPoolAmounts = (
    xlmAmount: bigint,
    usdcAmount: bigint,
    poolToken0: string,
    poolToken1: string
): { amount0: bigint; amount1: bigint } => {
    if (poolToken0 === CONTRACT_IDS.xlm && poolToken1 === CONTRACT_IDS.usdc) {
        return { amount0: xlmAmount, amount1: usdcAmount };
    }
    if (poolToken0 === CONTRACT_IDS.usdc && poolToken1 === CONTRACT_IDS.xlm) {
        return { amount0: usdcAmount, amount1: xlmAmount };
    }
    return { amount0: xlmAmount, amount1: usdcAmount };
};

interface RecoverablePosition {
    id: number;
    liquidity: string;
    tickLower: number;
    tickUpper: number;
    owner?: string;
}

interface StoredPosition {
    id: string;
    positionId: number;
    ownerAddress?: string; // Full wallet address for reliable matching
    token0: string;
    token1: string;
    tickLower: number;
    tickUpper: number;
    liquidity: string;
    minPrice: string;
    maxPrice: string;
    amount0: string;
    amount1: string;
    createdAt: number;
}

interface AprSnapshot {
    ts: number;
    feeReserveUsd: number;
    tvlUsd: number;
}

const isLegacyPositionForAddress = (
    position: StoredPosition,
    walletAddress: string | null | undefined
): boolean => {
    if (!walletAddress || position.ownerAddress) return false;
    return position.id.startsWith(walletAddress.substring(0, 10));
};

const PositionCard = ({
    position,
    currentPrice,
    priceHistory,
    onRemove,
    onCollect,
    loading
}: {
    position: StoredPosition;
    currentPrice: number;
    priceHistory: { time: string; price: number }[];
    onRemove: () => void;
    onCollect: () => void;
    loading: boolean;
}) => {
    const { t } = useI18n();
    const minPrice = parseFloat(position.minPrice);
    const maxPrice = parseFloat(position.maxPrice);
    const inRange = currentPrice >= minPrice && currentPrice <= maxPrice;
    const displayId =
        position.positionId > 1000000000000
            ? `#${position.createdAt.toString().slice(-4)}`
            : position.positionId;

    return (
        <div className="lux-card p-6 space-y-4 hover:border-[var(--accent)] group">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-1 border border-[var(--border)] group-hover:border-[var(--accent)] transition-colors">
                            <Layers size={12} className="text-[var(--foreground)]" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-[var(--foreground)] uppercase tracking-widest">
                            {t("pool.position.title", { id: displayId })}
                        </span>
                    </div>
                    <h3 className="text-sm font-mono font-bold uppercase">{position.token0}/{position.token1}</h3>
                </div>
                {inRange ? (
                    <span className="lux-pill border-[var(--accent)] text-[var(--accent)]">{t("pool.position.inRange")}</span>
                ) : (
                    <div className="text-right">
                        <span className="lux-pill border-red-500 text-red-500">{t("pool.position.outOfRange")}</span>
                        <span className="text-[10px] text-[var(--muted)] block mt-1">
                            {currentPrice < minPrice ? t("pool.position.priceBelow") : t("pool.position.priceAbove")}
                        </span>
                    </div>
                )}
            </div>

            <div className="w-full h-12">
                <PriceChart data={priceHistory} color={inRange ? "#b08d57" : "#9a9084"} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
                <div className="space-y-1">
                    <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-tighter">{t("pool.position.minPrice")}</span>
                    <p className="text-xs font-mono font-bold text-[var(--foreground)] uppercase">{position.minPrice}</p>
                </div>
                <div className="space-y-1 text-right">
                    <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-tighter">{t("pool.position.maxPrice")}</span>
                    <p className="text-xs font-mono font-bold text-[var(--foreground)] uppercase">{position.maxPrice}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--border)]">
                <div className="space-y-1">
                    <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-tighter">{t("pool.position.xlmDeposited")}</span>
                    <p className="text-xs font-mono font-bold text-[var(--foreground)]">{position.amount0}</p>
                </div>
                <div className="space-y-1 text-right">
                    <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-tighter">{t("pool.position.usdcDeposited")}</span>
                    <p className="text-xs font-mono font-bold text-[var(--foreground)]">{position.amount1}</p>
                </div>
            </div>

            <div className="flex gap-2 mt-2">
                <button
                    onClick={onCollect}
                    disabled={loading}
                    className="lux-button flex-1 text-[9px] py-1.5 flex items-center justify-center gap-1"
                >
                    <DollarSign size={12} />
                    {t("pool.position.collectFees")}
                </button>
                <button
                    onClick={onRemove}
                    disabled={loading}
                    className="lux-button flex-1 text-[9px] py-1.5 flex items-center justify-center gap-1 hover:border-red-500 hover:text-red-500"
                >
                    <Trash2 size={12} />
                    {t("pool.position.remove")}
                </button>
            </div>
        </div>
    );
};

export const PoolView = () => {
    const isDesktop = useIsDesktop();
    const [showNewPosition, setShowNewPosition] = useState(false);
    const [showRisk, setShowRisk] = useState(true);
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const buildStamp = process.env.NEXT_PUBLIC_BUILD_STAMP || 'ui-dev';
    const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
        title: string;
        body: string;
        confirmLabel?: string;
        onConfirm: () => void;
    } | null>(null);
    const recoveryPanelRef = useRef<HTMLDivElement | null>(null);
    const [recoverablePositions, setRecoverablePositions] = useState<RecoverablePosition[]>([]);
    const [recoveryLookupId, setRecoveryLookupId] = useState('');
    const [recoveryLookupLoading, setRecoveryLookupLoading] = useState(false);
    const [autoRefreshRecovery, setAutoRefreshRecovery] = useState(true);
    const [showRecoveryAdvanced, setShowRecoveryAdvanced] = useState(false);
    const [loading, setLoading] = useState(false);
    const [positions, setPositions] = useState<StoredPosition[]>([]);
    const [currentPrice, setCurrentPrice] = useState(0.1136); // Default, will be updated
    const [priceHistory, setPriceHistory] = useState<{ time: string; price: number }[]>([]);
    const [priceLoading, setPriceLoading] = useState(true);
    const [estimatedApr, setEstimatedApr] = useState<number | null>(null);
    const [poolStateSnapshot, setPoolStateSnapshot] = useState<PoolState | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [showRecovery, setShowRecovery] = useState(false);
    const [recovering, setRecovering] = useState<number | null>(null);
    const [recoveredPositions, setRecoveredPositions] = useState<number[]>([]);
    const [rangeAutoSeeded, setRangeAutoSeeded] = useState(false);
    const { address, walletType, positionManager, getPoolState, approveToken, checkAllowance, getTokenBalance } = useStellar();
    const { t, language } = useI18n();
    const visiblePositions = isDesktop ? positions.slice(0, 3) : positions;
    const hiddenPositionsCount = Math.max(positions.length - visiblePositions.length, 0);
    const filteredRecoverables = recoverablePositions.filter(p => !recoveredPositions.includes(p.id));
    const visibleRecoverables = isDesktop ? filteredRecoverables.slice(0, 2) : filteredRecoverables;
    const hiddenRecoverablesCount = Math.max(filteredRecoverables.length - visibleRecoverables.length, 0);

    // Form state
    const [fee, setFee] = useState(3000);
    const [minPrice, setMinPrice] = useState('0.10');
    const [maxPrice, setMaxPrice] = useState('0.15');
    const [rangePreset, setRangePreset] = useState<RangePreset>('spot');
    const [xlmAmount, setXlmAmount] = useState('');
    const [usdcAmount, setUsdcAmount] = useState('');
    const [lastEditedToken, setLastEditedToken] = useState<'xlm' | 'usdc' | null>(null);

    const minP = parseFloat(minPrice);
    const maxP = parseFloat(maxPrice);
    const hasRange = minP > 0 && maxP > minP;
    const rangeAbovePrice = hasRange && minP > currentPrice;
    const rangeBelowPrice = hasRange && maxP < currentPrice;
    const outOfRange = rangeAbovePrice || rangeBelowPrice;

    const canAdvanceStep1 = Boolean(xlmAmount && usdcAmount);
    const canAdvanceStep2 = hasRange;
    const canSkipToReview = canAdvanceStep1 && canAdvanceStep2;
    const primaryLabel = step === 1 ? t("pool.cta.continueToRange") : step === 2 ? t("pool.cta.review") : t("pool.cta.addLiquidity");
    const helperLabel = step === 1 ? t("pool.helper.enterToContinue") : step === 2 ? t("pool.helper.enterToReview") : t("pool.helper.enterToSubmit");

    const pushToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
        setToast({ type, message });
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    const computePoolApr = useCallback((feeReserveUsd: number, tvlUsd: number): number | null => {
        if (!Number.isFinite(feeReserveUsd) || !Number.isFinite(tvlUsd) || tvlUsd <= 0) {
            return null;
        }
        if (typeof window === 'undefined') {
            return null;
        }

        let snapshots: AprSnapshot[] = [];
        try {
            const raw = localStorage.getItem(APR_SNAPSHOT_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) {
                snapshots = parsed
                    .filter(
                        (entry): entry is AprSnapshot =>
                            typeof entry?.ts === 'number' &&
                            Number.isFinite(entry.ts) &&
                            typeof entry?.feeReserveUsd === 'number' &&
                            Number.isFinite(entry.feeReserveUsd) &&
                            typeof entry?.tvlUsd === 'number' &&
                            Number.isFinite(entry.tvlUsd)
                    )
                    .sort((a, b) => a.ts - b.ts);
            }
        } catch {
            snapshots = [];
        }

        const now = Date.now();
        const last = snapshots[snapshots.length - 1];
        if (!last || now - last.ts >= APR_SNAPSHOT_INTERVAL_MS) {
            snapshots.push({ ts: now, feeReserveUsd, tvlUsd });
        } else {
            snapshots[snapshots.length - 1] = { ts: now, feeReserveUsd, tvlUsd };
        }

        if (snapshots.length > APR_MAX_SNAPSHOTS) {
            snapshots = snapshots.slice(snapshots.length - APR_MAX_SNAPSHOTS);
        }

        try {
            localStorage.setItem(APR_SNAPSHOT_KEY, JSON.stringify(snapshots));
        } catch {
            // Ignore local storage failures; APR can still be computed for this session.
        }

        const targetTs = now - APR_TARGET_WINDOW_MS;
        const baseline =
            [...snapshots]
                .reverse()
                .find((snapshot) => snapshot.ts <= targetTs) ??
            snapshots[0];

        if (!baseline) return null;

        const elapsedMs = now - baseline.ts;
        if (elapsedMs < APR_MIN_WINDOW_MS) {
            return null;
        }

        const feeDeltaUsd = Math.max(0, feeReserveUsd - baseline.feeReserveUsd);
        const avgTvlUsd = (baseline.tvlUsd + tvlUsd) / 2;
        if (!Number.isFinite(avgTvlUsd) || avgTvlUsd <= 0) {
            return null;
        }

        const apr = (feeDeltaUsd / avgTvlUsd) * (MS_PER_YEAR / elapsedMs) * 100;
        if (!Number.isFinite(apr)) return null;
        return Math.max(0, Math.min(apr, 1_000_000));
    }, []);

    const fetchOwnedTokenIds = useCallback(async (owner: string): Promise<number[]> => {
        if (!positionManager) return [];

        try {
            const balanceResult = await positionManager.balance_of({ owner });
            const rawBalance = balanceResult?.result ?? 0;
            const balance = Number(rawBalance);
            if (!Number.isFinite(balance) || balance <= 0) {
                return [];
            }

            const total = Math.max(0, Math.floor(balance));
            const tokenIds: number[] = [];
            const maybePagedMethod = (positionManager as {
                get_owned_tokens_page?: (args: {
                    owner: string;
                    cursor: number;
                    limit: number;
                }) => Promise<{ result?: Array<number | string | bigint> }>;
            }).get_owned_tokens_page;

            if (typeof maybePagedMethod === 'function') {
                let cursor = 0;
                while (cursor < total) {
                    const result = await maybePagedMethod({
                        owner,
                        cursor,
                        limit: OWNED_TOKEN_PAGE_SIZE,
                    });
                    const chunk = Array.isArray(result?.result) ? result.result : [];
                    if (chunk.length === 0) break;
                    for (const tokenId of chunk) {
                        try {
                            tokenIds.push(toU32TokenId(tokenId));
                        } catch {
                            // Ignore malformed token ids.
                        }
                    }
                    cursor += chunk.length;
                    if (chunk.length < OWNED_TOKEN_PAGE_SIZE) break;
                }
                return tokenIds;
            }

            for (let start = 0; start < total; start += OWNED_TOKEN_PAGE_SIZE) {
                const end = Math.min(total, start + OWNED_TOKEN_PAGE_SIZE);
                const chunk = await Promise.all(
                    Array.from({ length: end - start }, (_, offset) =>
                        positionManager
                            .get_owner_token_id({ owner, index: start + offset })
                            .then((tx: { result?: number | string | bigint }) => tx.result)
                            .catch(() => null)
                    )
                );

                for (const tokenId of chunk) {
                    if (tokenId === null || tokenId === undefined) continue;
                    try {
                        tokenIds.push(toU32TokenId(tokenId));
                    } catch {
                        // Ignore malformed token ids.
                    }
                }
            }

            return tokenIds;
        } catch (error) {
            console.error('[Positions] Failed to fetch owned token IDs:', error);
            return [];
        }
    }, [positionManager]);

    const applyRangePreset = useCallback((preset: Exclude<RangePreset, 'custom'>) => {
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

        if (preset === 'full') {
            // Preserve full min/max ticks during minting; these values are display/edit defaults only.
            setMinPrice('0.000001');
            setMaxPrice('1000000');
            setRangePreset('full');
            return;
        }

        const marginPct = preset === 'tight' ? 0.05 : preset === 'wide' ? 0.5 : 0.15;
        const min = Math.max(0.000001, currentPrice * (1 - marginPct));
        const max = currentPrice * (1 + marginPct);
        setMinPrice(min.toFixed(6));
        setMaxPrice(max.toFixed(6));
        setRangePreset(preset);
    }, [currentPrice]);

    const applyAutoRange = useCallback(() => {
        applyRangePreset('spot');
    }, [applyRangePreset]);

    const handleMinPriceChange = useCallback((value: string) => {
        setMinPrice(value);
        setRangePreset('custom');
    }, []);

    const handleMaxPriceChange = useCallback((value: string) => {
        setMaxPrice(value);
        setRangePreset('custom');
    }, []);

    const copyToClipboard = useCallback(async (value: string) => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return true;
            }
        } catch {
            // fall through to legacy copy
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);
            return success;
        } catch {
            return false;
        }
    }, []);

    const promptCopyContractId = useCallback((walletLabel: string, positionId?: number | null) => {
        if (typeof window !== 'undefined') {
            const alreadyPrompted = sessionStorage.getItem('nft_add_prompted');
            if (alreadyPrompted) {
                pushToast('info', t("pool.toast.walletNoAutoAdd", { wallet: walletLabel }));
                return;
            }
            sessionStorage.setItem('nft_add_prompted', '1');
        }
        const tokenLine = positionId
            ? t("pool.dialog.tokenId", { id: positionId })
            : t("pool.dialog.tokenIdMissing");
        const copyPayload = positionId
            ? `Contract ID: ${CONTRACT_IDS.position_manager}\n${tokenLine}`
            : `Contract ID: ${CONTRACT_IDS.position_manager}`;
        setConfirmDialog({
            title: t("pool.dialog.addNftTitle"),
            body: t("pool.dialog.addNftBody", {
                wallet: walletLabel,
                contractId: CONTRACT_IDS.position_manager,
                tokenLine,
            }),
            confirmLabel: t("pool.dialog.copyContractId"),
            onConfirm: async () => {
                const copied = await copyToClipboard(copyPayload);
                if (copied) {
                    pushToast('success', t("pool.toast.contractCopied"));
                } else {
                    pushToast('error', t("pool.toast.contractCopyFailed"));
                }
            },
        });
    }, [copyToClipboard, pushToast, t]);

    const attemptAutoAddNftToWallet = useCallback(async (): Promise<{ added: boolean; reason?: string; needsTokenId?: boolean }> => {
        const walletName = walletType;
        if (!walletName) {
            return { added: false, reason: 'no-wallet' };
        }

        const normalized = walletName.toLowerCase();
        if (normalized === 'xbull') {
            return { added: false, reason: 'excluded' };
        }

        if (normalized === 'freighter') {
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            try {
                const timeoutError = new Error('Freighter addToken timeout');
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(timeoutError), FREIGHTER_ADD_TOKEN_TIMEOUT_MS);
                });

                const result = await Promise.race([
                    addToken({
                        contractId: CONTRACT_IDS.position_manager,
                        networkPassphrase: "Test SDF Network ; September 2015",
                    }),
                    timeoutPromise,
                ]);

                if (result.error || !result.contractId) {
                    return { added: false, reason: 'unsupported' };
                }
                return { added: true, needsTokenId: false };
            } catch (error) {
                if (error instanceof Error && error.message === 'Freighter addToken timeout') {
                    console.warn('[Wallet] Freighter addToken timed out; continuing without wallet auto-add');
                    return { added: false, reason: 'timeout', needsTokenId: true };
                }
                console.warn('[Wallet] Freighter addToken failed:', error);
                return { added: false, reason: 'unsupported' };
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        }

        return { added: false, reason: 'unsupported' };
    }, [walletType]);

    const addRecoverableCandidate = useCallback((candidate: RecoverablePosition) => {
        setRecoverablePositions((prev) => {
            const existing = prev.find((p) => p.id === candidate.id);
            if (existing) {
                return prev.map((p) => (p.id === candidate.id ? candidate : p));
            }
            return [candidate, ...prev];
        });
    }, []);

    const handleRecoveryLookup = useCallback(async () => {
        if (!positionManager) {
            pushToast('error', t("pool.toast.recoveryRequiresWallet"));
            return;
        }
        const id = Number(recoveryLookupId);
        if (!Number.isFinite(id) || id <= 0) {
            pushToast('error', t("pool.toast.invalidPositionId"));
            return;
        }
        if (recoveryLookupLoading) return;
        setRecoveryLookupLoading(true);
        try {
            const posResult = await positionManager.get_position({ token_id: toU32TokenId(id) });
            const pos = posResult.result;
            if (!pos) {
                pushToast('error', t("pool.toast.positionNotFound"));
                return;
            }

            let owner: string | undefined;
            try {
                const ownerResult = await positionManager.owner_of({ token_id: toU32TokenId(id) });
                owner = ownerResult.result ? String(ownerResult.result) : undefined;
            } catch {
                owner = undefined;
            }

            addRecoverableCandidate({
                id,
                liquidity: pos.liquidity?.toString?.() || String(pos.liquidity),
                tickLower: Number(pos.tick_lower),
                tickUpper: Number(pos.tick_upper),
                owner,
            });
            pushToast('success', t("pool.toast.loadedPosition", { id }));
        } catch (error) {
            console.error('[Recovery] Lookup failed:', error);
            pushToast('error', t("pool.toast.fetchPositionFailed"));
        } finally {
            setRecoveryLookupLoading(false);
        }
    }, [addRecoverableCandidate, positionManager, pushToast, recoveryLookupId, recoveryLookupLoading, t]);

    const handleRecoveryScan = useCallback(async () => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.scanRequiresWallet"));
            return;
        }
        if (recoveryLookupLoading) return;
        setRecoveryLookupLoading(true);
        try {
            const tokenIds = await fetchOwnedTokenIds(address);
            if (!tokenIds.length) {
                pushToast('info', t("pool.toast.noPositionsFound"));
                return;
            }
            const recoverableCandidates = (
                await Promise.all(
                    tokenIds.map(async (tokenId): Promise<RecoverablePosition | null> => {
                        try {
                            const normalizedTokenId = toU32TokenId(tokenId as number | string | bigint);
                            const posResult = await positionManager.get_position({ token_id: normalizedTokenId });
                            const pos = posResult.result;
                            if (!pos) return null;
                            return {
                                id: normalizedTokenId,
                                liquidity: pos.liquidity?.toString?.() || String(pos.liquidity),
                                tickLower: Number(pos.tick_lower),
                                tickUpper: Number(pos.tick_upper),
                                owner: address,
                            };
                        } catch {
                            // Ignore individual failures and keep scanning other token IDs.
                            return null;
                        }
                    })
                )
            ).filter((candidate): candidate is RecoverablePosition => candidate !== null);

            for (const candidate of recoverableCandidates) {
                addRecoverableCandidate(candidate);
            }
            pushToast('success', t("pool.toast.loadedPositionsFromWallet"));
        } catch (error) {
            console.error('[Recovery] Scan failed:', error);
            pushToast('error', t("pool.toast.scanFailed"));
        } finally {
            setRecoveryLookupLoading(false);
        }
    }, [addRecoverableCandidate, address, fetchOwnedTokenIds, positionManager, pushToast, recoveryLookupLoading, t]);

    useEffect(() => {
        if (!showRecovery || !autoRefreshRecovery) return;
        handleRecoveryScan();
        const interval = setInterval(() => {
            handleRecoveryScan();
        }, 120000);
        return () => clearInterval(interval);
    }, [autoRefreshRecovery, handleRecoveryScan, showRecovery]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    // Fetch current price from the pool state
    const fetchCurrentPrice = useCallback(async () => {
        try {
            setPriceLoading(true);
            const state = await getPoolState(CONTRACT_IDS.xlm_usdc_pool);
            if (!state) return;
            setPoolStateSnapshot(state);
            const rawPrice = priceFromTick(state.currentTick);
            if (!Number.isFinite(rawPrice) || rawPrice <= 0) return;
            // priceFromTick is token1/token0; normalize to UI price (USDC per XLM).
            const outputAmount = uiPriceFromPoolPrice(rawPrice, state.token0);
            setCurrentPrice(outputAmount);

            const [poolToken0Raw, poolToken1Raw] = await Promise.all([
                getTokenBalance(state.token0, CONTRACT_IDS.xlm_usdc_pool),
                getTokenBalance(state.token1, CONTRACT_IDS.xlm_usdc_pool),
            ]);

            const poolToken0 = BigInt(poolToken0Raw || '0');
            const poolToken1 = BigInt(poolToken1Raw || '0');
            const poolReserves = mapPoolAmountsToUiAmounts(poolToken0, poolToken1, state.token0, state.token1);
            const feeReserves = mapPoolAmountsToUiAmounts(
                state.feesUncollected0,
                state.feesUncollected1,
                state.token0,
                state.token1
            );

            const xlmReserve = Number(poolReserves.xlm) / 10 ** TOKEN_DECIMALS;
            const usdcReserve = Number(poolReserves.usdc) / 10 ** TOKEN_DECIMALS;
            const xlmFeeReserve = Number(feeReserves.xlm) / 10 ** TOKEN_DECIMALS;
            const usdcFeeReserve = Number(feeReserves.usdc) / 10 ** TOKEN_DECIMALS;

            const tvlUsd = usdcReserve + xlmReserve * outputAmount;
            const feeReserveUsd = usdcFeeReserve + xlmFeeReserve * outputAmount;
            setEstimatedApr(computePoolApr(feeReserveUsd, tvlUsd));

            setPriceHistory((prev) => {
                const next = [
                    ...prev,
                    {
                        time: new Date().toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
                        price: outputAmount,
                    },
                ];
                return next.slice(-20);
            });
            console.log('[POOL] Current price fetched:', outputAmount, 'USDC per XLM');
        } catch (e) {
            console.error('[POOL] Failed to fetch current price:', e);
            // Keep the default/previous price
        } finally {
            setPriceLoading(false);
        }
    }, [computePoolApr, getPoolState, getTokenBalance, language]);

    // Fetch price on mount and periodically
    useEffect(() => {
        fetchCurrentPrice();
        const interval = setInterval(fetchCurrentPrice, 30000); // Update every 30s
        return () => clearInterval(interval);
    }, [fetchCurrentPrice]);

    // Save positions to localStorage
    const savePositions = useCallback((newPositions: StoredPosition[]) => {
        if (typeof window !== 'undefined') {
            // Get all positions and update/add user's positions
            const stored = localStorage.getItem(POSITIONS_KEY);
            let allPositions: StoredPosition[] = [];
            if (stored) {
                try {
                    allPositions = JSON.parse(stored);
                } catch {
                    allPositions = [];
                }
            }
            // Remove user's old positions and add new ones
            const otherPositions = allPositions.filter(
                (p: StoredPosition) => p.ownerAddress !== address && !isLegacyPositionForAddress(p, address)
            );
            localStorage.setItem(POSITIONS_KEY, JSON.stringify([...otherPositions, ...newPositions]));
            setPositions(newPositions);
        }
    }, [address]);

    // Load positions from localStorage
    const loadPositions = useCallback(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(POSITIONS_KEY);
            console.log('[Positions] Loading from localStorage, raw:', stored);
            console.log('[Positions] Current address:', address);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    console.log('[Positions] Parsed positions:', parsed);
                    if (!Array.isArray(parsed)) {
                        setPositions([]);
                        return;
                    }
                    // Strict ownership filter: only positions explicitly owned by current wallet.
                    const userPositions = address
                        ? parsed.filter((p: StoredPosition) => p.ownerAddress === address)
                        : [];
                    const sanitizedPositions = userPositions.filter((p: StoredPosition) => isValidU32TokenId(p.positionId));
                    console.log('[Positions] Filtered user positions:', userPositions);
                    if (sanitizedPositions.length !== userPositions.length) {
                        console.warn('[Positions] Dropped invalid cached token IDs; run Sync from chain to refresh.');
                    }
                    setPositions(sanitizedPositions);
                } catch {
                    setPositions([]);
                }
            } else {
                console.log('[Positions] No positions in localStorage');
                setPositions([]);
            }
        }
    }, [address]);

    // Auto-load positions when address changes
    useEffect(() => {
        loadPositions();
    }, [loadPositions]);

    const canSubmitPosition = Boolean(address && xlmAmount && usdcAmount && !loading);

    // Sync positions from blockchain
    const syncFromChain = useCallback(async () => {
        if (syncing) return;
        if (!address || !positionManager) {
            console.log('[Sync] Wallet or contract not ready');
            return;
        }

        setSyncing(true);
        try {
            console.log('[Sync] Fetching owned position tokens from contract...');

            const activePoolState = poolStateSnapshot ?? await getPoolState(CONTRACT_IDS.xlm_usdc_pool);
            if (activePoolState) {
                setPoolStateSnapshot(activePoolState);
            }
            const poolToken0 = activePoolState?.token0 ?? CONTRACT_IDS.xlm;
            const poolToken1 = activePoolState?.token1 ?? CONTRACT_IDS.usdc;
            const poolCurrentTick = Number(activePoolState?.currentTick ?? 0);

            // 1. Get all token IDs owned by the user
            const tokenIds = await fetchOwnedTokenIds(address);

            console.log('[Sync] Found', tokenIds.length, 'tokens owned by user');

            // 2. Fetch metadata for each token in parallel to avoid RPC waterfalls.
            const convertedPositions = (
                await Promise.all(
                    tokenIds.map(async (tokenId): Promise<StoredPosition | null> => {
                        try {
                            const normalizedTokenId = toU32TokenId(tokenId as number | string | bigint);
                            const posResult = await positionManager.get_position({ token_id: normalizedTokenId });
                            const pos = posResult.result;
                            if (!pos) return null;

                            const rawMinPrice = priceFromTick(pos.tick_lower);
                            const rawMaxPrice = priceFromTick(pos.tick_upper);
                            const uiMinPrice = uiPriceFromPoolPrice(rawMinPrice, poolToken0);
                            const uiMaxPrice = uiPriceFromPoolPrice(rawMaxPrice, poolToken0);
                            const minPriceValue = Math.min(uiMinPrice, uiMaxPrice).toFixed(6);
                            const maxPriceValue = Math.max(uiMinPrice, uiMaxPrice).toFixed(6);

                            let xlmAmountValue = '0';
                            let usdcAmountValue = '0';
                            try {
                                const { amount0, amount1 } = calcAmountsFromLiquidity(
                                    BigInt(pos.liquidity),
                                    Number(pos.tick_lower),
                                    Number(pos.tick_upper),
                                    poolCurrentTick
                                );
                                const mapped = mapPoolAmountsToUiAmounts(amount0, amount1, poolToken0, poolToken1);
                                xlmAmountValue = formatStroopsToToken(mapped.xlm, TOKEN_DECIMALS);
                                usdcAmountValue = formatStroopsToToken(mapped.usdc, TOKEN_DECIMALS);
                            } catch (amountError) {
                                console.warn('[Sync] Failed to estimate position amounts:', amountError);
                            }

                            return {
                                id: `${address.substring(0, 10)}_${normalizedTokenId}`,
                                positionId: normalizedTokenId,
                                ownerAddress: address,
                                token0: 'XLM',
                                token1: 'USDC',
                                tickLower: pos.tick_lower,
                                tickUpper: pos.tick_upper,
                                liquidity: pos.liquidity.toString(),
                                minPrice: minPriceValue,
                                maxPrice: maxPriceValue,
                                amount0: xlmAmountValue,
                                amount1: usdcAmountValue,
                                createdAt: Date.now(), // We don't have block time here easily
                            };
                        } catch (posErr) {
                            console.error(`[Sync] Error fetching token ${tokenId}:`, posErr);
                            return null;
                        }
                    })
                )
            ).filter((position): position is StoredPosition => position !== null);

            console.log('[Sync] Successfully converted', convertedPositions.length, 'positions');

            // Update state and save to localStorage
            setPositions(convertedPositions);

            // Save to localStorage for future quick loads
            if (typeof window !== 'undefined') {
                const stored = localStorage.getItem(POSITIONS_KEY);
                let allPositions: StoredPosition[] = [];
                if (stored) {
                    try {
                        allPositions = JSON.parse(stored);
                    } catch {
                        allPositions = [];
                    }
                }
                // Remove user's old positions and add new synced ones
                const otherPositions = allPositions.filter(
                    (p: StoredPosition) => p.ownerAddress !== address && !isLegacyPositionForAddress(p, address)
                );
                localStorage.setItem(POSITIONS_KEY, JSON.stringify([...otherPositions, ...convertedPositions]));
            }

            pushToast('success', t("pool.toast.syncedPositions", { count: convertedPositions.length }));
        } catch (error) {
            console.error('[Sync] Error:', error);
            pushToast('error', t("pool.toast.syncFailed"));
        } finally {
            setSyncing(false);
        }
    }, [address, fetchOwnedTokenIds, getPoolState, poolStateSnapshot, positionManager, pushToast, syncing, t]);

    const pruneTransferredCachedPositions = useCallback(async () => {
        if (!address || !positionManager || positions.length === 0) return;

        try {
            const ownershipMatches = await Promise.all(
                positions.map(async (position) => {
                    try {
                        const ownerResult = await positionManager.owner_of({
                            token_id: toU32TokenId(position.positionId),
                        });
                        return ownerResult.result ? String(ownerResult.result) === address : false;
                    } catch {
                        return false;
                    }
                })
            );

            const ownedPositions = positions.filter((_, idx) => ownershipMatches[idx]);
            if (ownedPositions.length === positions.length) return;

            console.warn(
                '[Positions] Pruned stale cached positions after ownership transfer:',
                positions.length - ownedPositions.length
            );
            savePositions(ownedPositions);
        } catch (error) {
            console.warn('[Positions] Failed to prune stale cached positions:', error);
        }
    }, [address, positionManager, positions, savePositions]);

    useEffect(() => {
        void pruneTransferredCachedPositions();
    }, [pruneTransferredCachedPositions]);

    useEffect(() => {
        const handleRefreshLocal = () => loadPositions();
        const handleSyncChain = () => syncFromChain();
        window.addEventListener('pools:positions-refresh-local', handleRefreshLocal as EventListener);
        window.addEventListener('pools:positions-sync-chain', handleSyncChain as EventListener);
        return () => {
            window.removeEventListener('pools:positions-refresh-local', handleRefreshLocal as EventListener);
            window.removeEventListener('pools:positions-sync-chain', handleSyncChain as EventListener);
        };
    }, [loadPositions, syncFromChain]);

    // Execute recovery after confirmation
    const executeRecoverPosition = useCallback(async (positionId: number, liquidity: string) => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.walletNotConnected"));
            return;
        }

        console.log('[Recovery] Attempting to recover position', positionId, 'with liquidity', liquidity);
        setRecovering(positionId);

        try {
            const tx = await positionManager.burn({
                pool: CONTRACT_IDS.xlm_usdc_pool,
                to: address,
                token_id: toU32TokenId(positionId),
                liquidity: BigInt(liquidity),
            });

            console.log('[Recovery] Transaction built, signing and sending...');

            const result = await tx.signAndSend();
            console.log('[Recovery] Burn result:', result);

            setRecoveredPositions(prev => [...prev, positionId]);
            pushToast('success', t("pool.toast.recoveredPosition", { id: positionId }));
        } catch (error: unknown) {
            console.error('[Recovery] Error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            pushToast('error', t("pool.toast.recoverFailed", { id: positionId, error: errorMessage }));
        } finally {
            setRecovering(null);
        }
    }, [address, positionManager, pushToast, t]);

    const handleRecoverPosition = useCallback((positionId: number, liquidity: string) => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.walletNotConnected"));
            return;
        }

        const estimatedXlm = (Number(liquidity) / 1e7 * 0.585).toFixed(2);
        setConfirmDialog({
            title: t("pool.dialog.recoverTitle", { id: positionId }),
            body: t("pool.dialog.recoverBody", {
                liquidity: (Number(liquidity) / 1e7).toFixed(2),
                estimated: estimatedXlm,
            }),
            confirmLabel: t("pool.dialog.recoverConfirm"),
            onConfirm: () => executeRecoverPosition(positionId, liquidity),
        });
    }, [address, executeRecoverPosition, positionManager, pushToast, t]);

    const priceToTick = useCallback((price: number) => {
        return Math.floor(Math.log(price) / Math.log(1.0001));
    }, []);

    const quoteBySpotPrice = useCallback((inputToken: 'xlm' | 'usdc', amount: string): boolean => {
        const inputAmount = parseTokenAmountToStroops(amount, TOKEN_DECIMALS);
        if (inputAmount === null || inputAmount <= BI_ZERO) return false;
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;

        const spotPriceStroops = parseTokenAmountToStroops(currentPrice.toFixed(TOKEN_DECIMALS), TOKEN_DECIMALS);
        if (spotPriceStroops === null || spotPriceStroops <= BI_ZERO) return false;

        if (inputToken === 'xlm') {
            const quotedUsdc = ((inputAmount * spotPriceStroops) + (STROOPS_PER_TOKEN / BI_TWO)) / STROOPS_PER_TOKEN;
            setUsdcAmount(formatStroopsToToken(quotedUsdc, TOKEN_DECIMALS));
        } else {
            const quotedXlm = ((inputAmount * STROOPS_PER_TOKEN) + (spotPriceStroops / BI_TWO)) / spotPriceStroops;
            setXlmAmount(formatStroopsToToken(quotedXlm, TOKEN_DECIMALS));
        }
        return true;
    }, [currentPrice]);

    // Calculate the other token amount based on price range and input
    const calculateAmounts = useCallback((inputToken: 'xlm' | 'usdc', amount: string) => {
        if (!poolStateSnapshot) {
            quoteBySpotPrice(inputToken, amount);
            return;
        }
        const inputAmount = parseTokenAmountToStroops(amount, TOKEN_DECIMALS);
        if (inputAmount === null || inputAmount <= BI_ZERO) return;

        const minP = parseFloat(minPrice);
        const maxP = parseFloat(maxPrice);
        if (minP <= 0 || maxP <= 0 || minP >= maxP) {
            quoteBySpotPrice(inputToken, amount);
            return;
        }
        const poolPriceA = poolPriceFromUiPrice(minP, poolStateSnapshot.token0);
        const poolPriceB = poolPriceFromUiPrice(maxP, poolStateSnapshot.token0);
        if (!Number.isFinite(poolPriceA) || !Number.isFinite(poolPriceB) || poolPriceA <= 0 || poolPriceB <= 0) {
            quoteBySpotPrice(inputToken, amount);
            return;
        }

        const tickSpacing = Number(poolStateSnapshot.tickSpacing || 0);
        if (!Number.isFinite(tickSpacing) || tickSpacing <= 0) {
            quoteBySpotPrice(inputToken, amount);
            return;
        }
        const tickLower = clampTick(alignTickDown(priceToTick(Math.min(poolPriceA, poolPriceB)), tickSpacing));
        let tickUpper = clampTick(alignTickUp(priceToTick(Math.max(poolPriceA, poolPriceB)), tickSpacing));
        if (tickLower === tickUpper) {
            tickUpper = clampTick(tickLower + tickSpacing);
        }
        if (tickLower >= tickUpper) {
            return;
        }

        const oneSidedToken0 = poolStateSnapshot.currentTick <= tickLower;
        const oneSidedToken1 = poolStateSnapshot.currentTick >= tickUpper;
        if (oneSidedToken0 || oneSidedToken1) {
            if (step === 1 && quoteBySpotPrice(inputToken, amount)) {
                return;
            }
            if (inputToken === 'xlm') {
                setUsdcAmount('0');
            } else {
                setXlmAmount('0');
            }
            return;
        }

        const desiredByPoolToken = inputToken === 'xlm'
            ? (poolStateSnapshot.token0 === CONTRACT_IDS.xlm
                ? { desired0: inputAmount, desired1: UNBOUNDED_U128 }
                : { desired0: UNBOUNDED_U128, desired1: inputAmount })
            : (poolStateSnapshot.token0 === CONTRACT_IDS.usdc
                ? { desired0: inputAmount, desired1: UNBOUNDED_U128 }
                : { desired0: UNBOUNDED_U128, desired1: inputAmount });

        try {
            const liquidity = maxLiquidityForDesiredAmounts(
                desiredByPoolToken.desired0,
                desiredByPoolToken.desired1,
                tickLower,
                tickUpper,
                poolStateSnapshot.currentTick
            );
            if (liquidity <= BI_ZERO) {
                if (step === 1 && quoteBySpotPrice(inputToken, amount)) {
                    return;
                }
                if (inputToken === 'xlm') {
                    setUsdcAmount('0');
                } else {
                    setXlmAmount('0');
                }
                return;
            }

            const { amount0, amount1 } = calcAmountsFromLiquidity(
                liquidity,
                tickLower,
                tickUpper,
                poolStateSnapshot.currentTick
            );
            const mapped = mapPoolAmountsToUiAmounts(
                amount0,
                amount1,
                poolStateSnapshot.token0,
                poolStateSnapshot.token1
            );
            if (inputToken === 'xlm') {
                setUsdcAmount(formatStroopsToToken(mapped.usdc, TOKEN_DECIMALS));
            } else {
                setXlmAmount(formatStroopsToToken(mapped.xlm, TOKEN_DECIMALS));
            }
        } catch (calcError) {
            console.warn('[Liquidity] Amount preview failed:', calcError);
            quoteBySpotPrice(inputToken, amount);
        }
    }, [maxPrice, minPrice, poolStateSnapshot, priceToTick, quoteBySpotPrice, step]);

    const handleXlmChange = (value: string) => {
        setXlmAmount(value);
        setLastEditedToken('xlm');
        if (!value.trim()) {
            setUsdcAmount('');
            return;
        }
        calculateAmounts('xlm', value);
    };

    const handleUsdcChange = (value: string) => {
        setUsdcAmount(value);
        setLastEditedToken('usdc');
        if (!value.trim()) {
            setXlmAmount('');
            return;
        }
        calculateAmounts('usdc', value);
    };

    const sourceAmountForRequote =
        lastEditedToken === 'xlm' ? xlmAmount : lastEditedToken === 'usdc' ? usdcAmount : '';

    useEffect(() => {
        if (!lastEditedToken || !sourceAmountForRequote.trim()) return;
        calculateAmounts(lastEditedToken, sourceAmountForRequote);
    }, [calculateAmounts, lastEditedToken, sourceAmountForRequote]);

    const handleCreatePosition = useCallback(async () => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.createRequiresWallet"));
            return;
        }
        if (!xlmAmount || !usdcAmount) {
            pushToast('error', t("pool.toast.enterBothAmounts"));
            return;
        }

        setLoading(true);
        try {
            const minPriceNum = parseFloat(minPrice);
            const maxPriceNum = parseFloat(maxPrice);
            if (
                rangePreset !== 'full' &&
                (!Number.isFinite(minPriceNum) || !Number.isFinite(maxPriceNum) || minPriceNum <= 0 || maxPriceNum <= minPriceNum)
            ) {
                pushToast('error', 'Invalid price range. Please set Min < Max and both > 0.');
                return;
            }

            const poolState = await getPoolState(CONTRACT_IDS.xlm_usdc_pool);
            if (!poolState) {
                pushToast('error', 'Pool state unavailable. Please retry in a moment.');
                return;
            }
            setPoolStateSnapshot(poolState);
            const tickSpacing = Number(poolState.tickSpacing || 0);
            if (!Number.isFinite(tickSpacing) || tickSpacing <= 0) {
                pushToast('error', 'Invalid pool tick spacing. Please refresh and retry.');
                return;
            }

            let rawTickLower: number;
            let rawTickUpper: number;
            let tickLower: number;
            let tickUpper: number;

            if (rangePreset === 'full') {
                rawTickLower = MIN_TICK;
                rawTickUpper = MAX_TICK;
                tickLower = clampTick(alignTickUp(MIN_TICK, tickSpacing));
                tickUpper = clampTick(alignTickDown(MAX_TICK, tickSpacing));
            } else {
                const poolPriceA = poolPriceFromUiPrice(minPriceNum, poolState.token0);
                const poolPriceB = poolPriceFromUiPrice(maxPriceNum, poolState.token0);
                if (!Number.isFinite(poolPriceA) || !Number.isFinite(poolPriceB) || poolPriceA <= 0 || poolPriceB <= 0) {
                    pushToast('error', 'Invalid price range. Please adjust Min/Max and retry.');
                    return;
                }
                rawTickLower = priceToTick(Math.min(poolPriceA, poolPriceB));
                rawTickUpper = priceToTick(Math.max(poolPriceA, poolPriceB));
                tickLower = clampTick(alignTickDown(rawTickLower, tickSpacing));
                tickUpper = clampTick(alignTickUp(rawTickUpper, tickSpacing));
            }

            if (tickLower === tickUpper) {
                tickUpper = clampTick(tickLower + tickSpacing);
            }
            if (tickLower >= tickUpper) {
                pushToast(
                    'error',
                    `Price range is too narrow for fee tier tick spacing (${tickSpacing}). Increase range and retry.`
                );
                return;
            }

            const xlmStroops = parseTokenAmountToStroops(xlmAmount, TOKEN_DECIMALS);
            const usdcStroops = parseTokenAmountToStroops(usdcAmount, TOKEN_DECIMALS);
            if (xlmStroops === null || usdcStroops === null || xlmStroops <= BI_ZERO || usdcStroops <= BI_ZERO) {
                pushToast('error', 'Invalid token amounts. Please enter positive XLM and USDC amounts.');
                return;
            }

            const desiredByPoolToken = mapUiAmountsToPoolAmounts(
                xlmStroops,
                usdcStroops,
                poolState.token0,
                poolState.token1
            );
            const derivedLiquidity = maxLiquidityForDesiredAmounts(
                desiredByPoolToken.amount0,
                desiredByPoolToken.amount1,
                tickLower,
                tickUpper,
                poolState.currentTick
            );
            if (derivedLiquidity <= BI_ZERO) {
                pushToast('error', 'Input amounts are too small for the selected range at current price.');
                return;
            }

            const expectedPoolAmounts = calcAmountsFromLiquidity(
                derivedLiquidity,
                tickLower,
                tickUpper,
                poolState.currentTick
            );
            const expectedUiAmounts = mapPoolAmountsToUiAmounts(
                expectedPoolAmounts.amount0,
                expectedPoolAmounts.amount1,
                poolState.token0,
                poolState.token1
            );

            const [xlmBalanceRaw, usdcBalanceRaw] = await Promise.all([
                getTokenBalance(CONTRACT_IDS.xlm, address),
                getTokenBalance(CONTRACT_IDS.usdc, address),
            ]);
            const xlmBalance = BigInt(xlmBalanceRaw || '0');
            const usdcBalance = BigInt(usdcBalanceRaw || '0');
            if (xlmBalance < expectedUiAmounts.xlm) {
                pushToast('error', 'Insufficient XLM balance for requested liquidity input.');
                return;
            }
            if (usdcBalance < expectedUiAmounts.usdc) {
                pushToast('error', 'Insufficient USDC balance for requested liquidity input.');
                return;
            }

            const approvalTarget = CONTRACT_IDS.xlm_usdc_pool;
            const xlmApprovalTarget = expectedUiAmounts.xlm * BI_TWO;
            const usdcApprovalTarget = expectedUiAmounts.usdc * BI_TWO;
            const [xlmAllowance, usdcAllowance] = await Promise.all([
                checkAllowance(CONTRACT_IDS.xlm, address, approvalTarget),
                checkAllowance(CONTRACT_IDS.usdc, address, approvalTarget),
            ]);

            if (xlmApprovalTarget > BI_ZERO && xlmAllowance < xlmApprovalTarget) {
                pushToast('info', 'Approving XLM for pool liquidity transfer...');
                await approveToken(CONTRACT_IDS.xlm, approvalTarget, xlmApprovalTarget);
            }
            if (usdcApprovalTarget > BI_ZERO && usdcAllowance < usdcApprovalTarget) {
                pushToast('info', 'Approving USDC for pool liquidity transfer...');
                await approveToken(CONTRACT_IDS.usdc, approvalTarget, usdcApprovalTarget);
            }

            console.log('[Liquidity] Creating position:', {
                tickSpacing,
                rawTickLower,
                rawTickUpper,
                tickLower,
                tickUpper,
                xlmAmount,
                usdcAmount,
                expectedXlm: formatStroopsToToken(expectedUiAmounts.xlm, TOKEN_DECIMALS),
                expectedUsdc: formatStroopsToToken(expectedUiAmounts.usdc, TOKEN_DECIMALS),
                liquidity: derivedLiquidity.toString()
            });

            const tx = await positionManager.mint({
                to: address,
                token_a: CONTRACT_IDS.xlm,
                token_b: CONTRACT_IDS.usdc,
                fee: fee,
                tick_lower: tickLower,
                tick_upper: tickUpper,
                liquidity: derivedLiquidity,
            });

            console.log('[Liquidity] Transaction simulated, signing...');

            // Use expected on-chain amounts as defaults when wallet flow does not surface return values.
            let actualAmount0 = formatStroopsToToken(expectedUiAmounts.xlm, TOKEN_DECIMALS);
            let actualAmount1 = formatStroopsToToken(expectedUiAmounts.usdc, TOKEN_DECIMALS);
            let positionId: number | null = null;

            try {
                const result = await tx.signAndSend();
                console.log('[Liquidity] Transaction result:', result);

                // Try to extract actual amounts and position ID from result
                // Result is [amount0, amount1, positionId] where amounts are in smallest units
                if (result && result.result && Array.isArray(result.result)) {
                    try {
                        const amount0Raw = BigInt(result.result[0]);
                        const amount1Raw = BigInt(result.result[1]);
                        const mappedAmounts = mapPoolAmountsToUiAmounts(
                            amount0Raw,
                            amount1Raw,
                            poolState.token0,
                            poolState.token1
                        );
                        const parsedTokenId = Number(result.result[2]);
                        if (isValidU32TokenId(parsedTokenId)) {
                            positionId = parsedTokenId;
                        } else {
                            positionId = null;
                        }

                        actualAmount0 = formatStroopsToToken(mappedAmounts.xlm, TOKEN_DECIMALS);
                        actualAmount1 = formatStroopsToToken(mappedAmounts.usdc, TOKEN_DECIMALS);

                        console.log('[Liquidity] Actual amounts deposited:', {
                            xlm: actualAmount0,
                            usdc: actualAmount1,
                            positionId
                        });
                    } catch (parseError) {
                        console.warn('[Liquidity] Could not parse result, using entered amounts:', parseError);
                    }
                }
            } catch (signError) {
                // Handle Blux's direct submission
                const errorMsg = signError instanceof Error ? signError.message : String(signError);

                if (errorMsg.startsWith('BLUX_ALREADY_SUBMITTED:')) {
                    const txHash = errorMsg.split(':')[1];
                    console.log('[Liquidity] Transaction submitted by Blux, hash:', txHash);

                    // Query the RPC to get the transaction result and extract position ID
                    try {
                        const { rpc } = await import('@stellar/stellar-sdk');
                        const { RPC_URL } = await import('@/contracts/config');
                        const server = new rpc.Server(RPC_URL);

                        // Wait for transaction confirmation and get result
                        let attempts = 0;
                        while (attempts < 30) {
                            await new Promise(r => setTimeout(r, 1000));
                            try {
                                const txResult = await server.getTransaction(txHash);
                                if (txResult.status === 'SUCCESS' && 'returnValue' in txResult && txResult.returnValue) {
                                    const { scValToNative } = await import('@stellar/stellar-sdk');
                                    const native = scValToNative(txResult.returnValue);
                                    if (Array.isArray(native) && native.length >= 3) {
                                        const amount0Raw = BigInt(native[0] as string | number | bigint);
                                        const amount1Raw = BigInt(native[1] as string | number | bigint);
                                        const mappedAmounts = mapPoolAmountsToUiAmounts(
                                            amount0Raw,
                                            amount1Raw,
                                            poolState.token0,
                                            poolState.token1
                                        );
                                        actualAmount0 = formatStroopsToToken(mappedAmounts.xlm, TOKEN_DECIMALS);
                                        actualAmount1 = formatStroopsToToken(mappedAmounts.usdc, TOKEN_DECIMALS);
                                        const parsedTokenId = Number(native[2]);
                                        if (isValidU32TokenId(parsedTokenId)) {
                                            positionId = parsedTokenId;
                                            console.log('[Liquidity] Got position ID from RPC:', positionId);
                                        }
                                    }
                                    break;
                                } else if (txResult.status === 'FAILED') {
                                    throw new Error('Transaction failed on-chain');
                                }
                            } catch {
                                // Transaction not found yet, keep waiting
                            }
                            attempts++;
                        }
                    } catch (rpcError) {
                        console.warn('[Liquidity] Could not query RPC for position ID:', rpcError);
                    }
                } else {
                    throw signError;
                }
            }

            const resolvePositionId = async (): Promise<number | null> => {
                if (!positionManager || !address) return null;

                const candidateId = positionId;
                const candidateIsValid = candidateId !== null && isValidU32TokenId(candidateId);
                if (candidateIsValid) {
                    try {
                        const ownerResult = await positionManager.owner_of({ token_id: toU32TokenId(candidateId) });
                        if (ownerResult.result) {
                            return candidateId;
                        }
                    } catch {
                        // Ignore and fall back to owned tokens lookup
                    }
                }

                try {
                    const tokenIds = await fetchOwnedTokenIds(address);
                    let latest: bigint | null = null;
                    for (const tokenId of tokenIds) {
                        try {
                            const tokenBig = typeof tokenId === 'bigint' ? tokenId : BigInt(tokenId as unknown as string);
                            if (latest === null || tokenBig > latest) {
                                latest = tokenBig;
                            }
                        } catch {
                            // Skip invalid token IDs
                        }
                    }
                    return latest !== null ? Number(latest) : null;
                } catch {
                    return null;
                }
            };

            const resolvedPositionId = await resolvePositionId();
            if (resolvedPositionId !== null) {
                if (resolvedPositionId !== positionId) {
                    console.log('[Liquidity] Resolved position ID from chain:', resolvedPositionId);
                }
                positionId = resolvedPositionId;
            } else {
                console.warn('[Liquidity] Could not resolve position ID from chain for wallet push');
                await syncFromChain();
                pushToast('success', t("pool.toast.positionCreated", {
                    suffix: "",
                    xlm: xlmAmount,
                    usdc: usdcAmount,
                }));
                setShowNewPosition(false);
                setXlmAmount('');
                setUsdcAmount('');
                setLastEditedToken(null);
                return;
            }

            const walletName = walletType === 'freighter' ? 'Freighter' : 'Wallet';
            // Do not block position creation on wallet token registration flows.
            void attemptAutoAddNftToWallet()
                .then((walletAddResult) => {
                    if (walletAddResult.needsTokenId || !walletAddResult.added) {
                        if (walletAddResult.reason === 'excluded') {
                            pushToast('info', t("pool.toast.xbullExcluded"));
                        } else if (walletAddResult.needsTokenId || walletAddResult.reason === 'unsupported') {
                            promptCopyContractId(walletName, resolvedPositionId ?? positionId ?? null);
                        }
                    }
                })
                .catch((walletError) => {
                    console.warn('[Wallet] NFT auto-add flow failed in background:', walletError);
                });

            // Store position locally with best-effort amounts
            const newPosition: StoredPosition = {
                id: `${address.substring(0, 10)}_${positionId}`,
                positionId: positionId,
                ownerAddress: address, // Full address for reliable filtering
                token0: 'XLM',
                token1: 'USDC',
                tickLower,
                tickUpper,
                liquidity: xlmStroops.toString(),
                minPrice,
                maxPrice,
                amount0: actualAmount0,
                amount1: actualAmount1,
                createdAt: Date.now()
            };

            savePositions([...positions, newPosition]);
            pushToast(
                "success",
                t("pool.toast.positionCreated", {
                    suffix: "",
                    xlm: xlmAmount,
                    usdc: usdcAmount,
                })
            );
            setShowNewPosition(false);
            setXlmAmount('');
            setUsdcAmount('');
            setLastEditedToken(null);
        } catch (e: unknown) {
            console.error('[Liquidity] Error:', e);
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            const normalized = errorMessage.toLowerCase();
            if (
                normalized.includes('invalidaction') &&
                normalized.includes('add_liquidity') &&
                normalized.includes('transfer_from')
            ) {
                pushToast(
                    'error',
                    'Liquidity transfer failed. Check wallet balance and token approvals, then retry.'
                );
            } else if (
                normalized.includes('invalidaction') &&
                normalized.includes('add_liquidity')
            ) {
                pushToast(
                    'error',
                    'Invalid tick range for pool tick spacing. Use wider range values and retry.'
                );
            } else {
                pushToast('error', t("pool.toast.createFailed", { error: errorMessage }));
            }
        } finally {
            setLoading(false);
        }
    }, [address, walletType, positionManager, xlmAmount, usdcAmount, minPrice, maxPrice, rangePreset, fee, positions, savePositions, priceToTick, pushToast, attemptAutoAddNftToWallet, promptCopyContractId, syncFromChain, fetchOwnedTokenIds, getPoolState, approveToken, checkAllowance, getTokenBalance, t]);

    useEffect(() => {
        if (!showNewPosition) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowNewPosition(false);
                return;
            }
            if (event.key === 'Enter') {
                const target = event.target as HTMLElement | null;
                if (target && (target.tagName === 'TEXTAREA')) return;
                if (step < 3) {
                    if (step === 1 && xlmAmount && usdcAmount) {
                        setStep(2);
                    } else if (step === 2 && hasRange) {
                        setStep(3);
                    }
                    return;
                }
                if (canSubmitPosition) {
                    handleCreatePosition();
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [showNewPosition, canSubmitPosition, handleCreatePosition, step, xlmAmount, usdcAmount, hasRange]);

    useEffect(() => {
        if (showNewPosition) {
            setShowRisk(true);
            setStep(1);
            setRangeAutoSeeded(false);
            setRangePreset('spot');
            setLastEditedToken(null);
        }
    }, [showNewPosition]);

    useEffect(() => {
        if (!showNewPosition || step !== 2 || rangeAutoSeeded) return;
        applyAutoRange();
        setRangeAutoSeeded(true);
    }, [applyAutoRange, rangeAutoSeeded, showNewPosition, step]);

    useEffect(() => {
        const handleRecoveryToggle = () => {
            if (!address) {
                pushToast('error', t("pool.toast.recoveryRequiresWallet"));
                return;
            }
            setShowRecoveryAdvanced(true);
            setShowRecovery((prev) => !prev);
        };
        window.addEventListener('pools:recovery-toggle', handleRecoveryToggle as EventListener);
        return () => window.removeEventListener('pools:recovery-toggle', handleRecoveryToggle as EventListener);
    }, [address, pushToast, t]);

    useEffect(() => {
        if (!showRecovery) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest?.('[data-recovery-toggle]')) return;
            if (recoveryPanelRef.current?.contains(target as Node)) return;
            setShowRecovery(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showRecovery]);

    useEffect(() => {
        if (!showRecoveryAdvanced) {
            setShowRecovery(false);
        }
    }, [showRecoveryAdvanced]);



    const executeRemovePosition = useCallback(async (position: StoredPosition) => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.walletNotConnected"));
            return;
        }

        setLoading(true);
        try {
            if (!isValidU32TokenId(position.positionId)) {
                throw new Error('Invalid position ID in local cache. Use Sync from chain and retry.');
            }
            console.log('[Liquidity] Removing position:', position.positionId);

            const chainPositionResult = await positionManager.get_position({
                token_id: toU32TokenId(position.positionId),
            });
            const chainPosition = chainPositionResult.result;
            if (!chainPosition) {
                throw new Error(`Position ${position.positionId} not found on-chain`);
            }

            const liquidityToBurn = BigInt(chainPosition.liquidity);
            if (liquidityToBurn <= BigInt(0)) {
                throw new Error(`Position ${position.positionId} has no liquidity on-chain`);
            }

            const tx = await positionManager.burn({
                pool: String(chainPosition.pool),
                to: address,
                token_id: toU32TokenId(position.positionId),
                liquidity: liquidityToBurn,
            });

            try {
                await tx.signAndSend();
            } catch (signError) {
                const errorMsg = signError instanceof Error ? signError.message : '';
                if (errorMsg.startsWith('BLUX_ALREADY_SUBMITTED:')) {
                    console.log('[Liquidity] Remove transaction submitted by Blux');
                } else {
                    throw signError;
                }
            }

            const updatedPositions = positions.filter(p => p.id !== position.id);
            savePositions(updatedPositions);

            pushToast('success', t("pool.toast.positionRemoved", { id: position.positionId }));
        } catch (e: unknown) {
            console.error('[Liquidity] Remove error:', e);
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            pushToast('error', t("pool.toast.removeFailed", { error: errorMessage }));
        } finally {
            setLoading(false);
        }
    }, [address, positionManager, positions, savePositions, pushToast, t]);

    const handleRemovePosition = useCallback((position: StoredPosition) => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.walletNotConnected"));
            return;
        }
        setConfirmDialog({
            title: t("pool.dialog.removeTitle", { id: position.positionId }),
            body: t("pool.dialog.removeBody"),
            confirmLabel: t("pool.dialog.removeConfirm"),
            onConfirm: () => executeRemovePosition(position),
        });
    }, [address, executeRemovePosition, positionManager, pushToast, t]);

    const handleCollectFees = async (position: StoredPosition) => {
        if (!positionManager || !address) {
            pushToast('error', t("pool.toast.walletNotConnected"));
            return;
        }

        setLoading(true);
        try {
            if (!isValidU32TokenId(position.positionId)) {
                throw new Error('Invalid position ID in local cache. Use Sync from chain and retry.');
            }
            console.log('[Liquidity] Collecting fees for position:', position.positionId);

            const tx = await positionManager.collect({
                pool: CONTRACT_IDS.xlm_usdc_pool,
                to: address,
                token_id: toU32TokenId(position.positionId),  // NFT token_id
            });

            try {
                const result = await tx.signAndSend();
                console.log('[Liquidity] Collect result:', result);
            } catch (signError) {
                const errorMsg = signError instanceof Error ? signError.message : '';
                if (errorMsg.startsWith('BLUX_ALREADY_SUBMITTED:')) {
                    console.log('[Liquidity] Collect transaction submitted by Blux');
                    // Success - transaction was submitted
                } else {
                    throw signError;
                }
            }

            pushToast('success', t("pool.toast.feesCollected"));
        } catch (e: unknown) {
            console.error('[Liquidity] Collect error:', e);
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            pushToast('error', t("pool.toast.collectFailed", { error: errorMessage }));
        } finally {
            setLoading(false);
        }
    };

    const container = {
        hidden: {},
        show: { transition: { staggerChildren: 0.12 } },
    };

    const fadeUp = {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0 },
    };


    return (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 lg:space-y-4">
            <motion.div variants={fadeUp} className="flex flex-col gap-6 lg:gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3 lg:space-y-2">
                    <span className="lux-pill border-[var(--accent)] text-[var(--accent)]">{t("pool.badge")}</span>
                    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-2xl">{t("pool.title")}</h1>
                    <p className="text-sm text-[var(--muted)] lg:text-xs">
                        {t("pool.subtitle")}
                    </p>
                </div>

                <div className="flex items-center gap-4 w-full lg:w-auto">
                    <button
                        className="lux-button flex items-center gap-2 flex-1 lg:flex-none lg:px-3 lg:py-2 opacity-40 cursor-not-allowed"
                        disabled
                        title={t("pool.analyticsSoon")}
                    >
                        <BarChart3 size={14} />
                        <span>{t("pool.analytics")}</span>
                    </button>
                    <button
                        onClick={() => setShowNewPosition(true)}
                        className="lux-button-primary flex items-center gap-2 flex-1 lg:flex-none lg:px-4 lg:py-2"
                    >
                        <Plus size={14} />
                        <span>{t("pool.addLiquidity")}</span>
                    </button>
                </div>
            </motion.div>

            <motion.div variants={fadeUp} className="lux-card grid gap-6 lg:gap-3 p-6 lg:p-4 md:grid-cols-3">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">{t("pool.stats.activePositions")}</p>
                    <p className="mt-2 text-2xl font-semibold lg:text-xl">{positions.length}</p>
                    <p className="text-xs text-[var(--muted)] lg:text-[10px]">{t("pool.stats.syncedToWallet")}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">{t("pool.stats.poolPrice")}</p>
                    <div className="mt-2 flex items-center gap-2">
                        {priceLoading ? (
                            <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
                        ) : (
                            <p className="text-2xl font-semibold lg:text-xl">{currentPrice.toFixed(4)} USDC</p>
                        )}
                    </div>
                    <p className="text-xs text-[var(--muted)] lg:text-[10px]">{t("pool.stats.perXlm")}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">{t("pool.stats.estimatedApr")}</p>
                    <p className="mt-2 text-2xl font-semibold lg:text-xl">
                        {estimatedApr === null ? '--' : `${estimatedApr.toFixed(2)}%`}
                    </p>
                    <p className="text-xs text-[var(--muted)] lg:text-[10px]">{t("pool.stats.basedOnFees")}</p>
                </div>
            </motion.div>

            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-4 lg:hidden">
                <div className="lux-card p-6 lg:p-4">
                    <div className="flex items-center justify-between text-[var(--muted)] mb-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 size={14} />
                            <span className="text-[10px] uppercase tracking-[0.3em]">{t("pool.mobile.currentPrice")}</span>
                        </div>
                        <button
                            onClick={fetchCurrentPrice}
                            disabled={priceLoading}
                            className="p-1 hover:text-[var(--accent)] transition-colors"
                            title={t("pool.mobile.refreshPrice")}
                        >
                            <RefreshCw size={12} className={priceLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="flex items-end gap-2">
                        {priceLoading ? (
                            <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
                        ) : (
                            <p className="text-xl font-semibold">{currentPrice.toFixed(4)} USDC</p>
                        )}
                        <span className="text-[10px] text-[var(--muted)] mb-1">{t("pool.stats.perXlm")}</span>
                    </div>
                </div>
                <div className="lux-card p-6 lg:p-4">
                    <div className="flex items-center gap-2 text-[var(--muted)] mb-4">
                        <TrendingUp size={14} />
                        <span className="text-[10px] uppercase tracking-[0.3em]">{t("pool.mobile.yourPositions")}</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <p className="text-xl font-semibold">{positions.length}</p>
                        <span className="text-[10px] text-[var(--accent-secondary)] mb-1 uppercase tracking-[0.3em]">{t("pool.mobile.active")}</span>
                    </div>
                </div>
                <div className="lux-card p-6 lg:p-4">
                    <div className="flex items-center gap-2 text-[var(--muted)] mb-4">
                        <Shield size={14} />
                        <span className="text-[10px] uppercase tracking-[0.3em]">{t("pool.mobile.pool")}</span>
                    </div>
                    <div className="flex items-end gap-2">
                        <p className="text-xl font-semibold">XLM/USDC</p>
                        <span className="text-[10px] text-[var(--muted)] mb-1">{t("pool.mobile.fee", { fee: "0.3%" })}</span>
                    </div>
                </div>
            </motion.div>

            {/* Positions Section */}
            <motion.div variants={fadeUp} className="relative space-y-6 lg:space-y-3 pt-4 lg:pt-2 overflow-visible">
                <div className="flex flex-col gap-3 relative sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-[10px] font-mono font-bold text-[var(--muted)] uppercase tracking-[0.25em] sm:text-xs sm:tracking-[0.3em]">
                            {t("pool.positions.title", { count: positions.length })}
                        </h2>
                    </div>
                    {positions.length > 0 && (
                        <div className="flex gap-2">
                            {positions.map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 bg-[var(--accent)] animate-pulse" />
                            ))}
                        </div>
                    )}
                </div>

                {address && showRecovery && showRecoveryAdvanced && (
                    <div
                        ref={recoveryPanelRef}
                        className="fixed left-4 right-4 bottom-24 md:left-auto md:right-6 md:bottom-24 md:w-[420px] lux-card p-4 z-50"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] uppercase tracking-[0.25em] text-[var(--accent)]">
                                {t("pool.recovery.title")}
                            </p>
                            <button
                                onClick={() => setShowRecovery(false)}
                                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <p className="mt-2 text-[10px] text-[var(--muted)]">
                            {t("pool.recovery.description")}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <input
                                value={recoveryLookupId}
                                onChange={(e) => setRecoveryLookupId(e.target.value)}
                                placeholder={t("pool.recovery.positionIdPlaceholder")}
                                className="lux-input flex-1 text-xs"
                            />
                            <button
                                type="button"
                                onClick={handleRecoveryLookup}
                                disabled={recoveryLookupLoading}
                                className="lux-button px-3 py-2 text-[10px] tracking-[0.2em] disabled:opacity-50"
                            >
                                {recoveryLookupLoading ? t("general.loadingEllipsis") : t("pool.recovery.lookup")}
                            </button>
                            <button
                                type="button"
                                onClick={handleRecoveryScan}
                                disabled={recoveryLookupLoading}
                                className="lux-button px-3 py-2 text-[10px] tracking-[0.2em] disabled:opacity-50"
                            >
                                {t("pool.recovery.scanWallet")}
                            </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-[var(--muted)]">
                            <button
                                type="button"
                                onClick={() => setAutoRefreshRecovery((prev) => !prev)}
                                className="lux-button px-3 py-1 text-[9px] tracking-[0.2em]"
                            >
                                {t("pool.recovery.autoRefresh", {
                                    state: autoRefreshRecovery ? t("pool.recovery.on") : t("pool.recovery.off"),
                                })}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setRecoverablePositions([]);
                                    pushToast('info', t("pool.toast.clearedRecoveryCandidates"));
                                }}
                                className="lux-button px-3 py-1 text-[9px] tracking-[0.2em]"
                            >
                                {t("pool.recovery.clearList")}
                            </button>
                        </div>
                        <div className="mt-3 grid gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                            {visibleRecoverables.map((pos) => {
                                const canRecover = !pos.owner || pos.owner === address;
                                return (
                                    <div key={pos.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                                        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">
                                            <span>#{pos.id}</span>
                                            <span className="ml-2 text-[var(--foreground)]">
                                                {(Number(pos.liquidity) / 1e7).toFixed(2)} L
                                            </span>
                                            {pos.owner && (
                                                <span className={`ml-2 ${pos.owner === address ? 'text-emerald-500' : 'text-[var(--accent)]'}`}>
                                                    {pos.owner === address ? t("pool.recovery.owned") : t("pool.recovery.notOwned")}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleRecoverPosition(pos.id, pos.liquidity)}
                                            disabled={recovering !== null || !canRecover}
                                            className="px-3 py-1 text-[9px] uppercase tracking-[0.2em] rounded-full border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {recovering === pos.id ? t("pool.recovery.recovering") : t("pool.recovery.recover")}
                                        </button>
                                    </div>
                                );
                            })}
                            {filteredRecoverables.length === 0 && (
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-[10px] text-[var(--muted)]">
                                    {t("pool.recovery.empty")}
                                </div>
                            )}
                            {hiddenRecoverablesCount > 0 && (
                                <div className="text-[9px] font-mono text-[var(--accent)] uppercase tracking-[0.2em]">
                                    {t("pool.recovery.moreHidden", { count: hiddenRecoverablesCount })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-3">
                    {visiblePositions.map((position) => (
                        <PositionCard
                            key={position.id}
                            position={position}
                            currentPrice={currentPrice}
                            priceHistory={priceHistory}
                            onRemove={() => handleRemovePosition(position)}
                            onCollect={() => handleCollectFees(position)}
                            loading={loading}
                        />
                    ))}
                    {positions.length === 0 && (
                        <div className="lux-card p-5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">{t("pool.positions.emptyTitle")}</p>
                                <p className="mt-2 text-sm text-[var(--foreground)]">
                                    {t("pool.positions.emptyDescription")}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                {hiddenPositionsCount > 0 && (
                    <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.2em]">
                        {t("pool.positions.moreHidden", { count: hiddenPositionsCount })}
                    </div>
                )}
            </motion.div>

            {/* New Position Modal */}
            <AnimatePresence>
                {showNewPosition && (
                    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-6 pb-6 lg:items-center">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowNewPosition(false)}
                            className="absolute inset-0 bg-[var(--background)]/90 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="lux-card relative z-10 flex w-full max-w-3xl min-h-0 max-h-[calc(100dvh-3rem)] flex-col overflow-hidden border-t-4 border-t-[var(--accent)] lg:max-h-[85vh]"
                        >
                            <div className="flex justify-between items-start px-6 pt-5 pb-3 md:px-8">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-[var(--accent)]">
                                        <Zap size={14} />
                                        <h2 className="text-sm font-mono font-bold uppercase tracking-[0.35em]">{t("pool.modal.title")}</h2>
                                    </div>
                                    <p className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-[0.3em]">
                                        {t("pool.modal.poolTag", { pair: "XLM/USDC", fee: "0.3%" })}
                                    </p>
                                    <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-[var(--muted)]">
                                        {t("pool.modal.build", { stamp: buildStamp })}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 text-[8px] font-mono uppercase tracking-[0.3em] text-[var(--muted)]">
                                        <span>{t("pool.modal.step", { step, total: 3 })}</span>
                                        <span className="flex items-center gap-1">
                                            {[1, 2, 3].map((s) => (
                                                <span
                                                    key={s}
                                                    className={`h-1.5 w-1.5 rounded-full ${step >= s ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
                                                />
                                            ))}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setStep(3)}
                                        disabled={!canSkipToReview}
                                        className="text-[8px] font-mono uppercase tracking-[0.25em] text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:hover:text-[var(--muted)]"
                                    >
                                        {t("pool.modal.skipToReview")}
                                    </button>
                                    <button onClick={() => setShowNewPosition(false)} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-4 pr-1 md:px-8 md:pr-2">
                                <div className="flex items-center gap-3 text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--muted)] pb-4">
                                    <span className={step >= 1 ? "text-[var(--accent)]" : ""}>{t("pool.modal.stepAmounts")}</span>
                                    <span className="h-px flex-1 bg-[var(--border)]" />
                                    <span className={step >= 2 ? "text-[var(--accent)]" : ""}>{t("pool.modal.stepRange")}</span>
                                    <span className="h-px flex-1 bg-[var(--border)]" />
                                    <span className={step >= 3 ? "text-[var(--accent)]" : ""}>{t("pool.modal.stepReview")}</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                                    {step === 1 && (
                                        <div className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase tracking-[0.35em] pl-1">{t("pool.modal.depositAmounts")}</label>

                                                {/* XLM Input */}
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-[0.25em] pl-1">{t("pool.modal.xlmAmount")}</span>
                                                    <NumberField
                                                        value={xlmAmount}
                                                        onChange={handleXlmChange}
                                                        placeholder="0.0000"
                                                        step={0.0001}
                                                        precision={4}
                                                        suffix="XLM"
                                                        inputClassName="text-base font-mono font-bold"
                                                    />
                                                </div>

                                                {/* USDC Input */}
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-[0.25em] pl-1">{t("pool.modal.usdcAmount")}</span>
                                                    <NumberField
                                                        value={usdcAmount}
                                                        onChange={handleUsdcChange}
                                                        placeholder="0.00"
                                                        step={0.01}
                                                        precision={2}
                                                        suffix="USDC"
                                                        inputClassName="text-base font-mono font-bold"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase tracking-[0.35em] pl-1">{t("pool.modal.feeTier")}</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { value: 500, label: "0.05%" },
                                                        { value: 3000, label: "0.3%" },
                                                        { value: 10000, label: "1%" },
                                                    ].map(option => (
                                                        <button
                                                            key={option.value}
                                                            onClick={() => setFee(option.value)}
                                                            className={`px-4 py-2 text-[10px] font-mono font-bold uppercase border rounded-full transition-all ${fee === option.value ? 'bg-[var(--accent)] text-[var(--background)] border-[var(--accent)] shadow-[0_0_10px_var(--accent)]' : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'}`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="text-[8px] font-mono text-[var(--muted)] pl-1 tracking-[0.2em] uppercase">
                                                    {fee === 500 && t("pool.modal.feeStable")}
                                                    {fee === 3000 && t("pool.modal.feeMost")}
                                                    {fee === 10000 && t("pool.modal.feeExotic")}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {step === 2 && (
                                        <div className="space-y-6 md:col-span-2">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase tracking-[0.35em] pl-1">Range Presets</label>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                    {RANGE_PRESET_OPTIONS.map((option) => {
                                                        const active = rangePreset === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => applyRangePreset(option.id)}
                                                                className={`rounded-xl border px-3 py-2 text-left transition-all ${active
                                                                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)] shadow-[0_0_10px_var(--accent)]'
                                                                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
                                                                    }`}
                                                            >
                                                                <p className="text-[9px] font-mono font-bold uppercase tracking-[0.2em]">{option.label}</p>
                                                                <p className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-80">{option.hint}</p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <p className="text-[8px] font-mono text-[var(--muted)] pl-1 tracking-[0.2em] uppercase">
                                                    Choose Full Range for an infinite-style position (min tick to max tick).
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[9px] font-mono font-bold text-[var(--muted)] uppercase tracking-[0.35em] pl-1">{t("pool.modal.priceRangeLabel")}</label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-[0.2em]">{t("pool.modal.minPrice")}</span>
                                                        <NumberField
                                                            value={minPrice}
                                                            onChange={handleMinPriceChange}
                                                            step={0.0001}
                                                            precision={6}
                                                            inputClassName="text-center p-2 text-xs"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <span className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-[0.2em]">{t("pool.modal.maxPrice")}</span>
                                                        <NumberField
                                                            value={maxPrice}
                                                            onChange={handleMaxPriceChange}
                                                            step={0.0001}
                                                            precision={6}
                                                            inputClassName="text-center p-2 text-xs"
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-[8px] font-mono text-[var(--muted)] pl-1 tracking-[0.2em] uppercase">
                                                    {t("pool.modal.rangeHint")}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={applyAutoRange}
                                                    className="text-[8px] font-mono text-[var(--accent)] hover:underline uppercase tracking-[0.2em]"
                                                >
                                                    {t("pool.modal.setRangeAround")}
                                                </button>
                                            </div>

                                            {hasRange && (
                                                <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.25em] text-[var(--muted)]">
                                                    <span>{t("pool.modal.rangeStatus")}</span>
                                                    {outOfRange ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowRisk((prev) => !prev)}
                                                            className="text-[8px] font-mono uppercase tracking-[0.2em] text-amber-300 hover:text-amber-200"
                                                        >
                                                            {showRisk ? t("pool.modal.hideWarning") : t("pool.modal.showWarning")}
                                                        </button>
                                                    ) : (
                                                        <span className="text-emerald-300">{t("pool.position.inRange")}</span>
                                                    )}
                                                </div>
                                            )}

                                            {hasRange && outOfRange && showRisk && (
                                                <div className="p-3 border space-y-1 border-amber-500/50 bg-amber-500/10">
                                                    <p className="text-[10px] font-mono font-bold uppercase text-amber-400">{t("pool.modal.rangeWarningTitle")}</p>
                                                    {rangeAbovePrice && (
                                                        <p className="text-[8px] font-mono text-amber-200/90">
                                                            {t("pool.modal.rangeAboveWarning", {
                                                                min: minPrice,
                                                                max: maxPrice,
                                                                current: currentPrice.toFixed(4),
                                                            })}
                                                        </p>
                                                    )}
                                                    {rangeBelowPrice && (
                                                        <p className="text-[8px] font-mono text-amber-200/90">
                                                            {t("pool.modal.rangeBelowWarning", {
                                                                min: minPrice,
                                                                max: maxPrice,
                                                                current: currentPrice.toFixed(4),
                                                            })}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {hasRange && outOfRange && !showRisk && (
                                                <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[8px] font-mono uppercase tracking-[0.2em] text-amber-200">
                                                    <span>{t("pool.modal.rangeOutside")}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowRisk(true)}
                                                        className="text-[8px] text-amber-200 underline"
                                                    >
                                                        {t("pool.modal.review")}
                                                    </button>
                                                </div>
                                            )}

                                            <div className="p-4 border border-[var(--border)] border-l-2 border-l-[var(--accent-secondary)] bg-[var(--accent-secondary)]/10 space-y-2">
                                                <div className="flex justify-between items-center text-[10px] font-mono">
                                                    <span className="text-[var(--muted)] uppercase tracking-[0.25em]">{t("pool.modal.currentMarketPrice")}</span>
                                                    <span className="text-[var(--accent-secondary)] font-bold font-mono uppercase">{currentPrice.toFixed(4)} USDC</span>
                                                </div>
                                                <div className="w-full h-8 opacity-50">
                                                    <PriceChart data={priceHistory} color="var(--accent-secondary)" />
                                                </div>
                                                <div className="flex justify-between items-center text-[8px] font-mono text-[var(--muted)]">
                                                    <span>{t("pool.modal.rangeMin", { value: minPrice })}</span>
                                                    <span>{t("pool.modal.rangeCurrent")}</span>
                                                    <span>{t("pool.modal.rangeMax", { value: maxPrice })}</span>
                                                </div>
                                            </div>

                                            {parseFloat(minPrice) > 0 && parseFloat(maxPrice) > parseFloat(minPrice) && (
                                                <div className="p-3 border border-[var(--border)] bg-[var(--foreground)]/5 space-y-2">
                                                    <p className="text-[8px] font-mono text-[var(--muted)] uppercase tracking-[0.25em]">{t("pool.modal.requestedAmounts")}</p>
                                                    <div className="flex justify-between text-[10px] font-mono">
                                                        <span>{t("pool.modal.xlmLabel")}</span>
                                                        <span className="text-[var(--foreground)]">{xlmAmount || '0'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] font-mono">
                                                        <span>{t("pool.modal.usdcLabel")}</span>
                                                        <span className="text-[var(--foreground)]">{usdcAmount || '0'}</span>
                                                    </div>
                                                    <p className="text-[7px] font-mono text-yellow-500/80 pt-1 border-t border-[var(--border)]">
                                                        {t("pool.modal.amountsNote")}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {step === 3 && (
                                        <div className="space-y-6 md:col-span-2">
                                            <div className="lux-card p-4 space-y-3">
                                                <p className="text-[9px] uppercase tracking-[0.3em] text-[var(--muted)]">{t("pool.modal.reviewSummary")}</p>
                                                <div className="grid grid-cols-2 gap-4 text-[11px]">
                                                    <div>
                                                        <p className="text-[var(--muted)] uppercase tracking-[0.2em] text-[9px]">{t("pool.modal.depositLabel")}</p>
                                                        <p className="mt-2 font-mono text-[var(--foreground)]">
                                                            {t("pool.modal.xlmLabel")} {xlmAmount || "0"}
                                                        </p>
                                                        <p className="font-mono text-[var(--foreground)]">
                                                            {t("pool.modal.usdcLabel")} {usdcAmount || "0"}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[var(--muted)] uppercase tracking-[0.2em] text-[9px]">{t("pool.modal.rangeLabel")}</p>
                                                        <p className="mt-2 font-mono text-[var(--foreground)]">{minPrice} → {maxPrice} USDC</p>
                                                        <p className={`text-[9px] uppercase tracking-[0.2em] ${outOfRange ? "text-amber-300" : "text-emerald-300"}`}>
                                                            {outOfRange ? t("pool.position.outOfRange") : t("pool.position.inRange")}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {hasRange && outOfRange && showRisk && (
                                                <div className="p-3 border space-y-1 border-amber-500/50 bg-amber-500/10">
                                                    <p className="text-[10px] font-mono font-bold uppercase text-amber-400">{t("pool.modal.rangeWarningTitle")}</p>
                                                    {rangeAbovePrice && (
                                                        <p className="text-[8px] font-mono text-amber-200/90">
                                                            {t("pool.modal.rangeAboveWarning", {
                                                                min: minPrice,
                                                                max: maxPrice,
                                                                current: currentPrice.toFixed(4),
                                                            })}
                                                        </p>
                                                    )}
                                                    {rangeBelowPrice && (
                                                        <p className="text-[8px] font-mono text-amber-200/90">
                                                            {t("pool.modal.rangeBelowWarning", {
                                                                min: minPrice,
                                                                max: maxPrice,
                                                                current: currentPrice.toFixed(4),
                                                            })}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-[var(--border)] px-6 py-4 md:px-8">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <p className="text-[9px] uppercase tracking-[0.3em] text-[var(--muted)]">
                                        {t("pool.modal.helperWithEsc", { helper: helperLabel })}
                                    </p>
                                    <div className="flex w-full gap-3 md:w-auto">
                                        {step > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => setStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3)}
                                                className="lux-button w-full md:w-auto md:px-5 md:py-2"
                                            >
                                                {t("general.back")}
                                            </button>
                                        )}
                                        {step < 3 ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (step === 1 && canAdvanceStep1) setStep(2);
                                                    if (step === 2 && canAdvanceStep2) setStep(3);
                                                }}
                                                disabled={(step === 1 && !canAdvanceStep1) || (step === 2 && !canAdvanceStep2)}
                                                className="lux-button-primary w-full md:w-auto md:px-6 md:py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {primaryLabel}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleCreatePosition}
                                                disabled={loading || !address || !xlmAmount || !usdcAmount}
                                                className="lux-button-primary w-full md:w-auto md:px-6 md:py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {loading
                                                    ? t("general.processing")
                                                    : !address
                                                        ? t("wallet.connect")
                                                        : (!xlmAmount || !usdcAmount)
                                                            ? t("pool.modal.enterAmounts")
                                                            : t("pool.addLiquidity")}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {confirmDialog && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-[var(--background)]/80 backdrop-blur-sm"
                        onClick={() => setConfirmDialog(null)}
                    />
                    <div className="lux-card w-full max-w-md p-6 relative z-10">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">{t("general.confirmation")}</p>
                        <h3 className="mt-3 text-lg font-semibold">{confirmDialog.title}</h3>
                        <p className="mt-3 text-sm text-[var(--muted)] whitespace-pre-line break-all">
                            {confirmDialog.body}
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setConfirmDialog(null)}
                                className="lux-button px-4 py-2"
                            >
                                {t("general.cancel")}
                            </button>
                            <button
                                onClick={() => {
                                    const action = confirmDialog.onConfirm;
                                    setConfirmDialog(null);
                                    action();
                                }}
                                className="lux-button-primary px-5 py-2"
                            >
                                {confirmDialog.confirmLabel || t("general.confirm")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="fixed top-20 inset-x-4 z-[130] flex justify-center pointer-events-none md:top-24 md:left-1/2 md:-translate-x-1/2 md:w-[calc(100%-2rem)] md:max-w-[1400px] md:justify-end">
                    <div
                        className={`lux-card w-full max-w-md px-4 py-3 text-sm flex items-start gap-3 ${toast.type === 'success'
                                ? 'border-emerald-500/40 text-[var(--foreground)] bg-emerald-500/10'
                                : toast.type === 'error'
                                    ? 'border-rose-500/40 text-[var(--foreground)] bg-rose-500/10'
                                    : 'border-[var(--accent)]/40 text-[var(--foreground)] bg-[var(--accent)]/10'
                            }`}
                    >
                        <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">
                            {t(`toast.${toast.type}`)}
                        </span>
                        <span className="leading-relaxed break-words whitespace-pre-line">{toast.message}</span>
                    </div>
                </div>
            )}
        </motion.div>
    );
};
