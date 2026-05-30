"use client";

import React, { useEffect, useRef, useState } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

export function LanguageSwitcher() {
  const { language, setLanguage, languages, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const current = languages.find((l) => l.code === language);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="lux-button flex items-center gap-2"
        title={t("language.label")}
        type="button"
      >
        <Globe size={14} />
        <span className="font-mono text-[10px] uppercase tracking-[0.3em]">
          {current?.code.toUpperCase()}
        </span>
        <ChevronDown size={12} className={isOpen ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 min-w-[200px] z-50">
          <div className="lux-overlay-card p-2">
            <div className="px-3 py-2 text-[9px] uppercase tracking-[0.3em] text-[var(--muted)]">
              {t("language.label")}
            </div>
            <div className="flex flex-col">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-[11px] font-mono uppercase tracking-[0.25em] transition-colors ${
                    language === lang.code
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span>{lang.label}</span>
                  <span className="text-[9px]">{lang.code.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
