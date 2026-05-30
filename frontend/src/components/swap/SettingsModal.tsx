import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Settings } from "lucide-react";
import { useI18n } from "@/context/I18nContext";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    slippage: number;
    setSlippage: (value: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, slippage, setSlippage }) => {
    const [mounted, setMounted] = useState(false);
    const { t } = useI18n();

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!isOpen || !mounted) return null;

    const PRESETS = [0.1, 0.5, 1.0];

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[var(--background)]/60 backdrop-blur-sm">
            <div className="lux-card w-full max-w-sm p-6 space-y-6 relative">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Settings size={14} className="text-[var(--accent)]" />
                        <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.3em] text-[var(--foreground)]">
                            {t("swap.settings.title")}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close settings"
                        className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-3">
                    <label className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.3em]">
                        {t("swap.settings.slippageTolerance", { max: 1 })}
                    </label>
                    <div className="flex gap-2">
                        {PRESETS.map((val) => (
                            <button
                                key={val}
                                type="button"
                                onClick={() => setSlippage(val)}
                                className={`flex-1 rounded-full py-2 font-mono text-[10px] uppercase tracking-[0.3em] transition-all border ${slippage === val
                                    ? 'border-[var(--accent)] text-[var(--background)] bg-[var(--accent)]'
                                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                                    }`}
                            >
                                {val}%
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
