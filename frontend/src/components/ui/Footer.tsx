"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  Info,
  Mail,
  RefreshCw,
  Shield,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useStellar } from "@/context/StellarContext";
import { useI18n } from "@/context/I18nContext";

export function Footer() {
  const { latestLedger, latestLedgerHash, address } = useStellar();
  const pathname = usePathname();
  const [showDetails, setShowDetails] = useState(false);
  const [showSiteLinks, setShowSiteLinks] = useState(false);
  const siteLinksRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const showRecoveryTrigger = pathname?.startsWith("/pools");
  const recoveryDisabled = !address;

  useEffect(() => {
    if (!showSiteLinks) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!siteLinksRef.current?.contains(target)) {
        setShowSiteLinks(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSiteLinks]);

  return (
    <footer className="relative z-10 mt-8 border-t border-[var(--border)] bg-[var(--background)]/80 backdrop-blur lg:mt-0 lg:sticky lg:bottom-0 lg:shrink-0">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-[9px] uppercase tracking-[0.22em] text-[var(--muted)] md:px-10 lg:px-8 lg:py-1.5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[var(--foreground)]">RaumFi v2</span>
          <span>
            {t("footer.network")}: {t("footer.networkName")}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div ref={siteLinksRef} className="relative hidden lg:block order-last">
            <button
              type="button"
              onClick={() => setShowSiteLinks((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-[9px] uppercase tracking-[0.25em] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] hover:border-[var(--accent)]"
              aria-expanded={showSiteLinks}
            >
              <ChevronDown size={12} className={`transition-transform ${showSiteLinks ? "" : "rotate-180"}`} />
              Site Links
            </button>
            {showSiteLinks && (
              <div className="absolute right-0 bottom-full mb-5 min-w-[240px]">
                <div className="lux-overlay-card p-2 text-left">
                  <Link
                    href="/about"
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
                    onClick={() => setShowSiteLinks(false)}
                  >
                    <Info size={14} className="shrink-0" />
                    <span className="flex-1 text-right">About</span>
                  </Link>
                  <Link
                    href="/contact"
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
                    onClick={() => setShowSiteLinks(false)}
                  >
                    <Mail size={14} className="shrink-0" />
                    <span className="flex-1 text-right">Contact</span>
                  </Link>
                  <Link
                    href="/privacy"
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
                    onClick={() => setShowSiteLinks(false)}
                  >
                    <Shield size={14} className="shrink-0" />
                    <span className="flex-1 text-right">Privacy</span>
                  </Link>
                  <Link
                    href="/terminal"
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
                    onClick={() => setShowSiteLinks(false)}
                  >
                    <FileText size={14} className="shrink-0" />
                    <span className="flex-1 text-right">{t("footer.auditLogs")}</span>
                  </Link>
                  <a
                    href="https://v1.dex.raum.network"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
                    onClick={() => setShowSiteLinks(false)}
                  >
                    <ExternalLink size={14} className="shrink-0" />
                    <span className="flex-1 text-right">{t("footer.v1Dex")}</span>
                  </a>
                  {showRecoveryTrigger && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("pools:positions-refresh-local"));
                          setShowSiteLinks(false);
                        }}
                        className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em]"
                        title={t("pool.positions.refreshLocal")}
                      >
                        <RefreshCw size={14} className="shrink-0" />
                        <span className="flex-1 text-right">{t("pool.positions.refreshLocal")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (recoveryDisabled) return;
                          window.dispatchEvent(new CustomEvent("pools:positions-sync-chain"));
                          setShowSiteLinks(false);
                        }}
                        disabled={recoveryDisabled}
                        className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em] disabled:opacity-50 disabled:cursor-not-allowed"
                        title={recoveryDisabled ? t("pool.toast.walletNotConnected") : t("pool.positions.syncChain")}
                      >
                        <Database size={14} className="shrink-0" />
                        <span className="flex-1 text-right">{t("pool.positions.syncChain")}</span>
                      </button>
                      <button
                        type="button"
                        data-recovery-toggle
                        onClick={() => {
                          if (recoveryDisabled) return;
                          window.dispatchEvent(new CustomEvent("pools:recovery-toggle"));
                          setShowSiteLinks(false);
                        }}
                        disabled={recoveryDisabled}
                        title={recoveryDisabled ? t("footer.recoveryDisabled") : t("footer.recoveryTitle")}
                        className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[11px] font-mono text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors uppercase tracking-[0.3em] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Wrench size={14} className="shrink-0" />
                        <span className="flex-1 text-right">{t("footer.recoveryTools")}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          <span className="text-[var(--foreground)]">
            {t("footer.ledger")}: {latestLedger ? latestLedger.toLocaleString() : t("general.loading")}
          </span>
          {latestLedgerHash && (
            <span className="hidden lg:inline font-mono tracking-[0.22em] text-[9px] text-[var(--muted)]">
              {t("footer.hash")}: {latestLedgerHash.substring(0, 6)}...{latestLedgerHash.slice(-6)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="lg:hidden text-[9px] uppercase tracking-[0.22em] text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {showDetails ? t("footer.hide") : t("footer.details")}
          </button>
        </div>
      </div>
      {showDetails && (
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-4 px-4 pb-2 text-[9px] uppercase tracking-[0.22em] text-[var(--muted)] lg:hidden">
          <Link href="/about" className="hover:text-[var(--foreground)] transition-colors">
            About
          </Link>
          <Link href="/contact" className="hover:text-[var(--foreground)] transition-colors">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-[var(--foreground)] transition-colors">
            Privacy
          </Link>
          <span className="font-mono tracking-[0.22em] text-[9px] text-[var(--muted)]">
            {t("footer.hash")}: {latestLedgerHash ? `${latestLedgerHash.substring(0, 6)}...${latestLedgerHash.slice(-6)}` : t("general.loading")}
          </span>
          <span>{t("footer.auditLogs")}</span>
        </div>
      )}
    </footer>
  );
}
