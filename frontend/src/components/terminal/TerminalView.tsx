"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useStellar } from "@/context/StellarContext";
import { CONTRACT_IDS } from "@/contracts/config";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useI18n } from "@/context/I18nContext";

interface HistoryEntry {
    type: 'system' | 'user' | 'success' | 'error';
    text: string;
    timestamp: string;
}

export const TerminalView = () => {
    const { address, getTokenBalance, router } = useStellar();
    const isDesktop = useIsDesktop();
    const { t, language } = useI18n();
    const formatTimestamp = useCallback(
        () => new Date().toLocaleTimeString(language, { hour12: false }),
        [language]
    );
    const [history, setHistory] = useState<HistoryEntry[]>(() => {
        const timestamp = new Date().toLocaleTimeString(language, { hour12: false });
        return [
            { type: "system", text: t("terminal.boot.environmentLoaded"), timestamp },
            { type: "system", text: t("terminal.boot.networkStatus"), timestamp },
            { type: "system", text: t("terminal.boot.helpHint"), timestamp },
        ];
    });
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const terminalEndRef = useRef<HTMLDivElement>(null);
    const terminalInputId = "terminal-command-input";

    useEffect(() => {
        if (!isDesktop) {
            terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [history, isDesktop]);

    const displayHistory = isDesktop ? history.slice(-10) : history;

    const logToTerminal = useCallback((type: HistoryEntry['type'], text: string) => {
        setHistory(prev => [...prev, { type, text, timestamp: formatTimestamp() }]);
    }, [formatTimestamp]);

    // Fetch real balance
    const fetchBalance = useCallback(async () => {
        if (!address) {
            logToTerminal("error", t("terminal.errors.walletNotConnected"));
            return;
        }

        try {
            logToTerminal("system", t("terminal.status.fetchingBalances"));
            const xlmBal = await getTokenBalance(CONTRACT_IDS.xlm, address);
            const usdcBal = await getTokenBalance(CONTRACT_IDS.usdc, address);

            const xlmFormatted = (Number(xlmBal) / 10_000_000).toFixed(2);
            const usdcFormatted = (Number(usdcBal) / 10_000_000).toFixed(2);

            logToTerminal(
                "success",
                t("terminal.status.balanceLine", {
                    xlm: xlmFormatted,
                    usdc: usdcFormatted,
                })
            );
        } catch (e) {
            logToTerminal(
                "error",
                t("terminal.errors.fetchBalanceFailed", { error: String(e) })
            );
        }
    }, [address, getTokenBalance, logToTerminal, t]);

    // Fetch pool info
    const fetchPool = useCallback(async () => {
        if (!router) {
            logToTerminal("error", t("terminal.errors.routerNotReady"));
            return;
        }
        if (!address) {
            logToTerminal("error", t("terminal.errors.walletNotConnected"));
            return;
        }

        try {
            logToTerminal("system", t("terminal.status.fetchingPool"));

            // Get current price by simulating a swap
            const testAmount = BigInt(10_000_000); // 1 XLM
            const path = [{
                token_in: CONTRACT_IDS.xlm,
                token_out: CONTRACT_IDS.usdc,
                fee: 3000
            }];
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

            const tx = await router.swap_exact_input({
                path,
                amount_in: testAmount,
                amount_out_minimum: BigInt(0),
                payer: address,
                recipient: address,
                deadline,
                sqrt_price_limit_x96: [BigInt(0), BigInt(0)],
            });

            if (tx.result) {
                const price = (Number(tx.result) / 10_000_000).toFixed(4);
                logToTerminal(
                    "success",
                    t("terminal.status.poolInfoWithPrice", { price })
                );
            } else {
                logToTerminal("system", t("terminal.status.poolInfo"));
            }

            logToTerminal(
                "system",
                t("terminal.status.poolId", {
                    id: `${CONTRACT_IDS.xlm_usdc_pool.substring(0, 10)}...${CONTRACT_IDS.xlm_usdc_pool.substring(46)}`,
                })
            );
        } catch (e) {
            logToTerminal(
                "error",
                t("terminal.errors.fetchPoolFailed", { error: String(e) })
            );
        }
    }, [router, address, logToTerminal, t]);

    // Fetch network status
    const fetchStatus = useCallback(async () => {
        try {
            const response = await fetch('https://soroban-testnet.stellar.org', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getLatestLedger'
                })
            });
            const data = await response.json();
            if (data.result) {
                logToTerminal(
                    "system",
                    t("terminal.status.networkLedger", {
                        ledger: data.result.sequence.toLocaleString(),
                    })
                );
                logToTerminal("success", t("terminal.status.allSystemsOperational"));
            }
        } catch {
            logToTerminal("error", t("terminal.errors.fetchNetworkFailed"));
        }
    }, [logToTerminal, t]);

    const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && input.trim() && !isProcessing) {
            const cmd = input.toLowerCase().trim();
            logToTerminal('user', `> ${input}`);
            setInput('');
            setIsProcessing(true);

            try {
                if (cmd === 'help') {
                    logToTerminal("system", t("terminal.help.availableCommands"));
                    logToTerminal("system", t("terminal.help.command", { cmd: "balance", desc: t("terminal.help.balance") }));
                    logToTerminal("system", t("terminal.help.command", { cmd: "pool", desc: t("terminal.help.pool") }));
                    logToTerminal("system", t("terminal.help.command", { cmd: "status", desc: t("terminal.help.status") }));
                    logToTerminal("system", t("terminal.help.command", { cmd: "address", desc: t("terminal.help.address") }));
                    logToTerminal("system", t("terminal.help.command", { cmd: "contracts", desc: t("terminal.help.contracts") }));
                    logToTerminal("system", t("terminal.help.command", { cmd: "clear", desc: t("terminal.help.clear") }));
                } else if (cmd === 'status') {
                    await fetchStatus();
                } else if (cmd === 'clear') {
                    setHistory([{ type: "system", text: t("terminal.status.consoleCleared"), timestamp: formatTimestamp() }]);
                } else if (cmd === 'balance') {
                    await fetchBalance();
                } else if (cmd === 'pool') {
                    await fetchPool();
                } else if (cmd === 'address') {
                    if (address) {
                        logToTerminal("success", t("terminal.status.walletAddress", { address }));
                    } else {
                        logToTerminal("error", t("terminal.errors.walletDisconnected"));
                    }
                } else if (cmd === 'contracts') {
                    logToTerminal("system", t("terminal.status.contractAddresses"));
                    logToTerminal("system", t("terminal.status.contractLine", { name: "Router", address: `${CONTRACT_IDS.router.substring(0, 10)}...` }));
                    logToTerminal("system", t("terminal.status.contractLine", { name: "Pool", address: `${CONTRACT_IDS.xlm_usdc_pool.substring(0, 10)}...` }));
                    logToTerminal("system", t("terminal.status.contractLine", { name: "Factory", address: `${CONTRACT_IDS.factory.substring(0, 10)}...` }));
                    logToTerminal("system", t("terminal.status.contractLine", { name: "Governance", address: `${CONTRACT_IDS.governance.substring(0, 10)}...` }));
                } else {
                    logToTerminal("error", t("terminal.errors.unknownCommand", { cmd }));
                }
            } catch (err) {
                logToTerminal("error", t("terminal.errors.generic", { error: String(err) }));
            } finally {
                setIsProcessing(false);
            }
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lux-card cli-fuzzy h-[600px] lg:h-full flex flex-col overflow-hidden"
        >
            <h1 className="sr-only">{t("terminal.header")}</h1>
            {/* Terminal Header */}
            <div className="px-8 py-4 lg:px-4 lg:py-3 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface)]">
                <span className="text-[9px] text-[var(--muted)] tracking-[0.3em] uppercase">
                    {t("terminal.header")}
                </span>
                <div className="flex items-center gap-2">
                    {address && (
                        <span className="text-[8px] text-[var(--accent)] font-mono">
                            {address.substring(0, 6)}...{address.substring(52)}
                        </span>
                    )}
                    <div className={`w-1.5 h-1.5 ${isProcessing ? 'bg-amber-500' : 'bg-[var(--accent)]'} animate-pulse`} />
                </div>
            </div>

            {/* Terminal Output */}
            <div className="custom-scrollbar flex-grow p-8 lg:p-4 space-y-4 font-mono text-[11px] overflow-y-auto lg:overflow-visible leading-relaxed bg-[var(--surface-2)]/50">
                {displayHistory.map((line, i) => (
                    <div
                        key={i}
                        className={`flex items-start gap-4 ${line.type === 'error' ? 'text-rose-500' :
                            line.type === 'success' ? 'text-[var(--accent-secondary)]' :
                                line.type === 'user' ? 'text-[var(--foreground)] border-l-2 border-[var(--accent)] pl-4' :
                                    'text-[var(--muted)]'
                            }`}
                    >
                        <span className="opacity-20 shrink-0">
                            [{line.timestamp}]
                        </span>
                        <span className="whitespace-pre-wrap">{line.text}</span>
                    </div>
                ))}
                <div ref={terminalEndRef} />
            </div>

            {/* Terminal Input */}
            <div className="p-6 lg:p-4 border-t border-[var(--border)] flex items-center gap-4 bg-[var(--surface)]">
                <ChevronRight size={16} className={`${isProcessing ? 'text-amber-500' : 'text-[var(--accent)]'}`} />
                <label htmlFor={terminalInputId} className="sr-only">
                    {t("terminal.input.placeholder")}
                </label>
                <input
                    id={terminalInputId}
                    name={terminalInputId}
                    type="text"
                    autoFocus
                    disabled={isProcessing}
                    aria-label={t("terminal.input.placeholder")}
                    className="bg-transparent border-none outline-none text-[var(--foreground)] flex-grow font-mono text-xs disabled:opacity-50"
                    placeholder={isProcessing ? t("terminal.input.processing") : t("terminal.input.placeholder")}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleCommand}
                />
            </div>
        </motion.div>
    );
};
