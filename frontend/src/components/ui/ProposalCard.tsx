"use client";

import React from "react";
import { Clock, Gavel } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/context/I18nContext";

interface ProposalCardProps {
  id: string;
  title: string;
  description: string;
  status: "Active" | "Defeated" | "Passed" | "Executed";
  forVotes: number;
  againstVotes: number;
  endTime: number;
  onVoteYes: () => void;
  onVoteNo: () => void;
  onViewDetails: () => void;
}

export const ProposalCard = ({
  id,
  title,
  description,
  status,
  forVotes,
  againstVotes,
  endTime,
  onVoteYes,
  onVoteNo,
  onViewDetails,
}: ProposalCardProps) => {
  const { t } = useI18n();
  const totalVotes = forVotes + againstVotes;
  const forPercentage = totalVotes > 0 ? (forVotes / totalVotes) * 100 : 50;
  const isVotingOpen = status === "Active" && endTime > Date.now();
  const statusLabelMap: Record<ProposalCardProps["status"], string> = {
    Active: t("governance.status.active"),
    Defeated: t("governance.status.defeated"),
    Passed: t("governance.status.passed"),
    Executed: t("governance.status.executed"),
  };

  const statusTone = {
    Active: "border-[var(--accent)] text-[var(--accent)]",
    Defeated: "border-rose-500 text-rose-500",
    Passed: "border-[var(--accent-secondary)] text-[var(--accent-secondary)]",
    Executed: "border-emerald-500 text-emerald-500",
  }[status];

  return (
    <div className="lux-card p-6 lg:p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[var(--muted)]">
            <Gavel size={12} />
            <span className="text-[10px] uppercase tracking-[0.3em]">
              {t("governance.proposal")} #{id}
            </span>
          </div>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <span className={`lux-pill ${statusTone}`}>{statusLabelMap[status]}</span>
      </div>

      <p className="mt-4 text-sm text-[var(--muted)] leading-relaxed clamp-3">
        {description}
      </p>
      <button
        type="button"
        onClick={onViewDetails}
        className="mt-3 text-[10px] uppercase tracking-[0.3em] text-[var(--accent)] hover:text-[var(--foreground)] transition-colors"
      >
        {t("governance.viewDetails")}
      </button>

      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-[10px] uppercase tracking-[0.3em]">
          <span className="text-[var(--accent)]">
            {t("governance.support", { percent: forPercentage.toFixed(0) })}
          </span>
          <span className="text-[var(--muted)]">
            {t("governance.oppose", { percent: (100 - forPercentage).toFixed(0) })}
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-[var(--border)] overflow-hidden">
          <motion.div
            className="h-full bg-[var(--accent)]"
            initial={{ width: 0 }}
            animate={{ width: `${forPercentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4 text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
        <div className="flex items-center gap-2">
          <Clock size={12} />
          <span>
            {endTime > Date.now()
              ? t("governance.endsIn", { days: Math.ceil((endTime - Date.now()) / 86400000) })
              : t("governance.closed")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onVoteYes}
            disabled={!isVotingOpen}
            className="rounded-full border border-emerald-500/40 px-3 py-1 text-emerald-400 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("governance.voteYes")}
          </button>
          <button
            type="button"
            onClick={onVoteNo}
            disabled={!isVotingOpen}
            className="rounded-full border border-rose-500/40 px-3 py-1 text-rose-400 transition-colors hover:border-rose-500 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("governance.voteNo")}
          </button>
        </div>
      </div>
    </div>
  );
};
