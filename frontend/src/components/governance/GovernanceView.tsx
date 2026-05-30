"use client";

import React, { useEffect, useState } from "react";
import { Plus, Search, TrendingUp, Users, CheckCircle, Activity, Gavel } from "lucide-react";
import { ProposalCard } from "../ui/ProposalCard";
import { motion, AnimatePresence } from "framer-motion";
import { useStellar } from "@/context/StellarContext";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useI18n } from "@/context/I18nContext";
import { CONTRACT_IDS } from "@/contracts/config";

const StatCard = ({
  icon: Icon,
  label,
  value,
  trend,
  note,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: string;
  note?: string;
}) => (
  <div className="lux-card p-6 lg:p-4">
    <div className="flex items-center gap-2 text-[var(--muted)] mb-4">
      <Icon size={14} />
      <span className="text-[10px] uppercase tracking-[0.3em]">{label}</span>
    </div>
    <div className="flex items-end gap-2">
      <p className="text-2xl font-semibold">{value}</p>
      {trend && <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent)]">{trend}</span>}
    </div>
    {note && <p className="mt-2 text-xs text-[var(--muted)]">{note}</p>}
  </div>
);

interface Proposal {
  id: string;
  title: string;
  description: string;
  status: "Active" | "Executed" | "Defeated" | "Passed";
  forVotes: number;
  againstVotes: number;
  endTime: number;
}

export const GovernanceView = () => {
  const isDesktop = useIsDesktop();
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [votingPower, setVotingPower] = useState("-- XLM");
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProposal, setNewProposal] = useState({ title: "", desc: "" });
  const { governance, address, getTokenBalance } = useStellar();
  const { t } = useI18n();
  const searchInputId = "governance-proposal-search";
  const proposalTitleId = "governance-proposal-title";
  const proposalDescId = "governance-proposal-desc";

  const formatVotingPower = (rawBalance: string): string => {
    try {
      const decimals = 7;
      const divisor = 10 ** decimals;
      const amount = Number(rawBalance) / divisor;
      if (!Number.isFinite(amount)) return "-- XLM";
      const compact = new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount);
      return `${compact} XLM`;
    } catch {
      return "-- XLM";
    }
  };

  const fetchVotingPower = React.useCallback(async () => {
    if (!address || typeof getTokenBalance !== "function") {
      setVotingPower("-- XLM");
      return;
    }
    try {
      const raw = await getTokenBalance(CONTRACT_IDS.xlm, address);
      setVotingPower(formatVotingPower(raw));
    } catch (error) {
      console.error("Error fetching voting power", error);
      setVotingPower("-- XLM");
    }
  }, [address, getTokenBalance]);

  const fetchProposals = React.useCallback(async () => {
    if (!governance) return;
    setLoading(true);
    try {
      const fetched: Proposal[] = [];
      for (let i = 1; i <= 20; i++) {
        try {
          const tx = await governance.get_proposal({ proposal_id: BigInt(i) });
          if (tx.result) {
            fetched.push({
              id: tx.result.id.toString(),
              title: tx.result.title,
              description: tx.result.desc,
              status: (tx.result.status as { tag: string }).tag as Proposal["status"],
              forVotes: Number(tx.result.for_votes),
              againstVotes: Number(tx.result.against_votes),
              endTime: Number(tx.result.vote_end) * 1000,
            });
          }
        } catch {
          continue;
        }
      }
      setProposals(fetched);
    } catch (error) {
      console.error("Error fetching proposals", error);
    } finally {
      setLoading(false);
    }
  }, [governance]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  useEffect(() => {
    fetchVotingPower();
  }, [fetchVotingPower]);

  const handleVote = async (proposalId: string, support: boolean) => {
    if (!governance || !address) {
      alert(t("governance.alert.connectWallet"));
      return;
    }
    try {
      const tx = await governance.vote({
        voter: address,
        proposal_id: BigInt(proposalId),
        support,
      });
      await tx.signAndSend();
      alert(t("governance.alert.voteSubmitted"));
      fetchProposals();
    } catch (error) {
      console.error("Error voting", error);
      alert(t("governance.alert.voteFailed"));
    }
  };

  const handleCreateProposal = async () => {
    if (!governance || !address) return;
    setLoading(true);
    try {
      const tx = await governance.propose({
        proposer: address,
        title: newProposal.title,
        desc: newProposal.desc,
        action_contract: address,
        action_function: "initialize",
        action_args: [],
        voting_period: BigInt(259200),
      });

      try {
        await tx.signAndSend();
      } catch (signError) {
        const errorMsg = signError instanceof Error ? signError.message : String(signError);
        if (!errorMsg.includes("switch") && !errorMsg.includes("e.switch")) {
          throw signError;
        }
      }

      alert(t("governance.alert.proposalCreated"));
      setShowCreateModal(false);
      setNewProposal({ title: "", desc: "" });
      fetchProposals();
    } catch (error) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("Insufficient balance") || errorMsg.includes("10 XLM")) {
        alert(t("governance.alert.createRequiresBalance"));
      } else if (errorMsg.includes("simulation failed")) {
        alert(t("governance.alert.createSimulationFailed"));
      } else {
        alert(
          t("governance.alert.createFailedWithError", {
            error: errorMsg.substring(0, 100),
          })
        );
      }
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

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProposals = proposals.filter((p) => {
    const matchesStatus = activeFilter === "All" || p.status === activeFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;
    return (
      p.id.toLowerCase().includes(normalizedSearch) ||
      p.title.toLowerCase().includes(normalizedSearch) ||
      p.description.toLowerCase().includes(normalizedSearch)
    );
  });
  const visibleProposals = isDesktop ? filteredProposals.slice(0, 4) : filteredProposals;
  const totalVotes = proposals.reduce((sum, p) => sum + p.forVotes + p.againstVotes, 0);
  const closedProposals = proposals.filter((p) => p.status !== "Active").length;
  const successfulProposals = proposals.filter(
    (p) => p.status === "Executed" || p.status === "Passed"
  ).length;
  const successRate = closedProposals > 0 ? Math.round((successfulProposals / closedProposals) * 100) : 0;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="flex h-full min-h-0 flex-col gap-10 overflow-hidden lg:gap-6"
    >
      <motion.div variants={fadeUp} className="space-y-3">
        <div className="space-y-3">
          <span className="lux-pill border-[var(--accent)] text-[var(--accent)]">
            {t("governance.badge")}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-2xl">
            {t("governance.title")}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {t("governance.subtitle")}
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="grid w-full gap-4 md:w-auto md:grid-cols-3 lg:gap-3">
          <StatCard
            icon={Users}
            label={t("governance.stats.totalVoters")}
            value={totalVotes.toLocaleString()}
          />
          <StatCard
            icon={TrendingUp}
            label={t("governance.votingPower")}
            value={votingPower}
          />
          <StatCard
            icon={CheckCircle}
            label={t("governance.stats.successRate")}
            value={`${successRate}%`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="lux-button-primary flex items-center gap-2"
        >
          <Plus size={14} />
          {t("governance.createProposal")}
        </button>
      </motion.div>

      <motion.div variants={fadeUp} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4 overflow-x-auto">
          {[
            { value: "All", label: t("governance.filter.all") },
            { value: "Active", label: t("governance.filter.active") },
            { value: "Passed", label: t("governance.filter.passed") },
            { value: "Defeated", label: t("governance.filter.defeated") },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setActiveFilter(filter.value)}
              className={`text-[10px] uppercase tracking-[0.3em] transition-colors ${
                activeFilter === filter.value
                  ? "text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
          <Search size={14} />
          <label htmlFor={searchInputId} className="sr-only">
            {t("governance.search")}
          </label>
          <input
            id={searchInputId}
            type="text"
            aria-label={t("governance.search")}
            placeholder={t("governance.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-44 bg-transparent text-[10px] uppercase tracking-[0.3em] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />
        </div>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-6 pt-2"
      >
        {loading && !visibleProposals.length ? (
          <div className="lux-card flex items-center justify-center py-20 text-[var(--muted)]">
            <div className="flex items-center gap-2">
              <Activity size={18} className="animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.3em]">{t("governance.loading")}</span>
            </div>
          </div>
        ) : visibleProposals.length > 0 ? (
          visibleProposals.map((prop) => (
            <ProposalCard
              key={prop.id}
              {...prop}
              onVoteYes={() => handleVote(prop.id, true)}
              onVoteNo={() => handleVote(prop.id, false)}
              onViewDetails={() => setSelectedProposal(prop)}
            />
          ))
        ) : (
          <div className="lux-card flex flex-col items-center justify-center py-20 text-[var(--muted)] gap-3">
            <Gavel size={28} className="opacity-60" />
            <span className="text-[10px] uppercase tracking-[0.3em]">{t("governance.empty")}</span>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-[var(--background)]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="lux-card w-full max-w-lg p-8 relative z-10"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    <Gavel size={14} />
                    <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">{t("governance.newProposal")}</h2>
                  </div>
                  <p className="text-[10px] text-[var(--muted)] uppercase tracking-[0.3em]">
                    {t("governance.core")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Close proposal modal"
                  className="text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor={proposalTitleId} className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                    {t("governance.form.title")}
                  </label>
                  <input
                    id={proposalTitleId}
                    name={proposalTitleId}
                    type="text"
                    value={newProposal.title}
                    onChange={(e) => setNewProposal({ ...newProposal, title: e.target.value })}
                    placeholder={t("governance.form.titlePlaceholder")}
                    className="lux-input"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor={proposalDescId} className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                    {t("governance.form.description")}
                  </label>
                  <textarea
                    id={proposalDescId}
                    name={proposalDescId}
                    rows={4}
                    value={newProposal.desc}
                    onChange={(e) => setNewProposal({ ...newProposal, desc: e.target.value })}
                    placeholder={t("governance.form.descriptionPlaceholder")}
                    className="lux-input resize-none h-28"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="lux-button"
                  >
                    {t("general.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateProposal}
                    disabled={loading || !address}
                    className="lux-button-primary disabled:opacity-50"
                  >
                    {loading ? t("governance.submitting") : t("governance.create")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedProposal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProposal(null)}
              className="absolute inset-0 bg-[var(--background)]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label={t("governance.details")}
              className="lux-card relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden"
            >
              <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                    {t("governance.proposal")} #{selectedProposal.id}
                  </p>
                  <h2 className="text-lg font-semibold">{selectedProposal.title}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close proposal details"
                  onClick={() => setSelectedProposal(null)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
                <p className="text-sm leading-relaxed text-[var(--muted)] whitespace-pre-wrap">
                  {selectedProposal.description}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4 text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                <span>
                  {selectedProposal.endTime > Date.now()
                    ? t("governance.endsIn", {
                        days: Math.ceil((selectedProposal.endTime - Date.now()) / 86400000),
                      })
                    : t("governance.closed")}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleVote(selectedProposal.id, true)}
                    disabled={selectedProposal.status !== "Active" || selectedProposal.endTime <= Date.now()}
                    className="rounded-full border border-emerald-500/40 px-3 py-1 text-emerald-400 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("governance.voteYes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVote(selectedProposal.id, false)}
                    disabled={selectedProposal.status !== "Active" || selectedProposal.endTime <= Date.now()}
                    className="rounded-full border border-rose-500/40 px-3 py-1 text-rose-400 transition-colors hover:border-rose-500 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("governance.voteNo")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
