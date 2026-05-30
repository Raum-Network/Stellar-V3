"use client";

import React from "react";
import { useTheme } from "@/context/ThemeContext";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

export function ThemeSwitcher() {
    const { theme, toggleTheme } = useTheme();
    const { t } = useI18n();

    return (
        <button
            onClick={toggleTheme}
            className="lux-button flex items-center"
            title={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
        >
            {theme === "dark" ? (
                <>
                    <Sun size={14} className="shrink-0" />
                    <span className="flex-1 text-center font-mono text-[10px] uppercase tracking-[0.3em]">
                        {t("theme.light")}
                    </span>
                </>
            ) : (
                <>
                    <Moon size={14} className="shrink-0" />
                    <span className="flex-1 text-center font-mono text-[10px] uppercase tracking-[0.3em]">
                        {t("theme.dark")}
                    </span>
                </>
            )}
        </button>
    );
}
