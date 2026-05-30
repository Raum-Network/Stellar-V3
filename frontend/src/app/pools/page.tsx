import type { Metadata } from "next";
import { PoolView } from "@/components/pool/PoolView";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Pools | RAUM CLMM DEX Position and Range Management",
  description:
    "Manage concentrated liquidity position NFTs, rebalance active ranges, and track collected fees with RAUM CLMM pool tooling built for Stellar participants.",
  path: "/pools",
});

export default function PoolsPage() {
  return (
    <>
      <section className="sr-only">
        <h2>Pool Management Route</h2>
        <p>
          The Pools route is focused on lifecycle management for concentrated-liquidity positions on RAUM
          CLMM DEX. Liquidity providers can inspect existing positions, review fee accrual, and execute range
          updates as market conditions evolve. Position state is represented through on-chain identifiers so
          activity can be audited against contract events and local operational records.
        </p>
        <p>
          Concentrated-liquidity strategies require ongoing monitoring because capital is active only within
          selected price bands. This page is structured to make that monitoring practical: users can compare
          position state, identify stale ranges, and coordinate maintenance actions such as repositioning or
          harvesting fees. Clear status feedback is surfaced to reduce ambiguity during wallet interactions.
        </p>
        <p>
          The Pools workflow is linked with the rest of the application. Traders can move to Swap for direct
          execution, review market context in Dashboard, and inspect governance activity when protocol changes
          may affect incentives or behavior. Terminal tools provide additional diagnostics when users require
          contract-level confirmation during troubleshooting.
        </p>
        <p>
          RAUM publishes support and policy resources through the About, Contact, and Privacy routes. These
          pages are intended to provide ownership context, issue-reporting channels, and policy details for
          users who need trust and compliance references before integrating or operating at scale.
        </p>
        <p>
          Operators should review position state frequently when prices approach configured boundaries. A
          range that was efficient at entry may become inactive as market conditions shift, reducing fee
          capture and increasing strategy drift. Pool management tools on this route are maintained to help
          users detect those conditions early and coordinate timely adjustments with clear execution context.
        </p>
        <p>
          Historical position notes and fee snapshots can improve decision quality when comparing rebalance
          outcomes across multiple market cycles.
        </p>
      </section>
      <PoolView />
    </>
  );
}
