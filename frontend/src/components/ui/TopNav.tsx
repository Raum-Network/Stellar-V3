"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { WalletProfileV2 } from "@/components/ui/WalletProfileV2";
import { useI18n } from "@/context/I18nContext";

export function TopNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useI18n();

  const navLinks = [
    { label: t("nav.dashboard"), href: "/dashboard" },
    { label: t("nav.swap"), href: "/swap" },
    { label: t("nav.pools"), href: "/pools" },
    { label: t("nav.governance"), href: "/governance" },
    { label: t("nav.terminal"), href: "/terminal" },
  ];

  const isActive = (href: string) =>
    pathname === href || (href === "/dashboard" && pathname === "/");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-4 md:px-10 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                <Image src="/raumfi_logo.svg" alt="RAUM" width={18} height={18} priority />
              </div>
              <div>
                <span className="block text-sm font-semibold tracking-[0.3em] uppercase text-[var(--foreground)]">
                  RAUM
                </span>
                <span className="block text-[10px] uppercase tracking-[0.45em] text-[var(--muted)]">
                  {t("brand.liquidityOs")}
                </span>
              </div>
            </Link>

            <div className="hidden items-center gap-4 lg:flex">
              <span className="h-8 w-px bg-[var(--border)]" />
              <nav className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 p-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.25em] transition-colors ${
                      isActive(link.href)
                        ? "bg-[var(--surface-2)] text-[var(--accent)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <WalletProfileV2 />
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={t("nav.menu")}
            className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-[var(--muted)] transition-colors hover:text-[var(--foreground)] lg:hidden"
          >
            <Menu size={16} />
            {t("nav.menu")}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-[var(--background)]/80 backdrop-blur"
              onClick={() => setIsOpen(false)}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 24, stiffness: 220 }}
              className="fixed right-0 top-0 z-50 h-full w-[85%] max-w-sm border-l border-[var(--border)] bg-[var(--surface)] px-6 py-8 shadow-[0_30px_80px_rgba(0,0,0,0.2)]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.5em] text-[var(--muted)]">
                  {t("nav.navigation")}
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close menu"
                  className="rounded-full border border-[var(--border)] p-2 text-[var(--muted)]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-8 flex flex-col gap-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`text-sm uppercase tracking-[0.35em] ${
                      isActive(link.href)
                        ? "text-[var(--accent)]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="mt-10 flex flex-col gap-4">
                <WalletProfileV2 />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
