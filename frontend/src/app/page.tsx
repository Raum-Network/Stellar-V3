import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "RAUM CLMM DEX | Stellar Concentrated Liquidity Hub",
  description:
    "RAUM CLMM DEX is a Stellar-native interface for concentrated liquidity trading, pool operations, governance participation, and protocol visibility.",
  path: "/",
});

export default function Home() {
  return (
    <>
      <section className="sr-only">
        <h2>RAUM CLMM DEX on Stellar</h2>
        <p>
          RAUM CLMM DEX is a concentrated-liquidity exchange interface built for the Stellar network.
          Traders can execute swaps, market operators can track pool activity, and strategy teams can review
          range-based position behavior from a single environment. The product is designed for practical
          execution workflows where users need fast state visibility before sending transactions.
        </p>
        <p>
          The platform includes dedicated routes for swaps, pools, governance, and terminal operations.
          Liquidity providers can manage NFT-backed positions, monitor uncollected fees, and reconcile
          records against on-chain updates. Governance interfaces support proposal drafting and vote tracking
          so protocol decisions can be reviewed through a transparent and repeatable process.
        </p>
        <p>
          This site is operated as a production interface for the RAUM CLMM protocol and includes legal,
          trust, and support documentation. Public resources such as About, Contact, and Privacy pages are
          maintained for users, auditors, and integration partners who require operational context before
          connecting wallets or interacting with contracts.
        </p>
        <p>
          RAUM CLMM DEX surfaces contract-linked market information, updates pool telemetry at recurring
          intervals, and provides terminal diagnostics to inspect network and protocol health. The goal is
          to combine routing, position management, and governance awareness into a coherent operator workflow
          with predictable navigation and clear accountability.
        </p>
        <p>
          Before any transaction is signed, users should verify wallet network settings, token amounts,
          price impact context, and route-specific status messages. Operational safety depends on deliberate
          validation of these details, especially in volatile conditions where execution parameters can
          change quickly. RAUM publishes route-level guidance and support pathways to encourage responsible
          usage and reduce avoidable errors during production activity.
        </p>
        <p>
          Explore key routes:
          <a href="/dashboard"> Dashboard</a>,
          <a href="/swap"> Swap</a>,
          <a href="/pools"> Pools</a>,
          <a href="/governance"> Governance</a>,
          <a href="/terminal"> Terminal</a>,
          <a href="/about"> About</a>,
          <a href="/contact"> Contact</a>,
          <a href="/privacy"> Privacy</a>.
        </p>
      </section>
      <DashboardView />
    </>
  );
}
