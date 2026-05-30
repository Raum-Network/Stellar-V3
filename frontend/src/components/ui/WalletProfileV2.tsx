"use client";

import React, { useState, useEffect, useRef } from "react";
import { LogOut, Copy, Check, ChevronDown } from "lucide-react";
import { useStellar } from "@/context/StellarContext";
import { useI18n } from "@/context/I18nContext";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export const WalletProfileV2 = () => {
  const { address, connect, disconnect, connecting } = useStellar();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    }
  };

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    void disconnect();
    setIsOpen(false);
  };

  if (!address) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          void connect();
        }}
        disabled={connecting}
        className="lux-button-primary flex items-center justify-center font-mono disabled:opacity-60 px-4 py-2.5"
      >
        <span>{connecting ? t("wallet.syncing") : t("wallet.connect")}</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative" style={{ zIndex: 100 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-full border px-4 py-2.5 font-mono text-xs uppercase tracking-[0.3em] transition-all ${
          isOpen
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)]"
        }`}
      >
        <span>
          {address.substring(0, 6)}...{address.substring(address.length - 6)}
        </span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180 text-[var(--accent)]" : "text-[var(--muted)]"}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2" style={{ zIndex: 9999, minWidth: "240px" }}>
          <div className="lux-overlay-card p-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-3 border-b border-[var(--border)] mb-1">
              <p className="text-[9px] text-[var(--muted)] uppercase font-mono mb-1 tracking-[0.3em]">
                {t("wallet.connected")}
              </p>
              <p className="text-[11px] text-[var(--foreground)] font-mono break-all leading-relaxed">{address}</p>
            </div>

            <div className="mb-1 border-b border-[var(--border)] px-2 pb-2 pt-1">
              <div className="grid gap-2 [&_button.lux-button]:w-full [&_button.lux-button]:justify-between">
                <ThemeSwitcher />
                <LanguageSwitcher />
              </div>
            </div>

            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
            >
              <span>{t("wallet.copyAddress")}</span>
              {copied ? <Check size={14} className="text-[var(--accent)]" /> : <Copy size={14} className="group-hover:scale-110 transition-transform" />}
            </button>

            <button
              onClick={handleDisconnect}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-red-500 hover:bg-red-500/10 transition-colors uppercase tracking-[0.3em]"
            >
              <span>{t("wallet.disconnect")}</span>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
