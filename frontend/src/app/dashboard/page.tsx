import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Dashboard | RAUM CLMM DEX Market and Liquidity Intel",
  description:
    "Use the RAUM CLMM dashboard to monitor pool depth, price movement, position activity, and protocol signals that inform trading and liquidity decisions.",
  path: "/dashboard",
});

export default function DashboardPage() {
  return (
    <>
      <section className="sr-only">
        <h2>Dashboard Overview</h2>
        <p>
          The dashboard route provides a consolidated operational view for RAUM CLMM DEX on Stellar.
          Market participants can review current pool signals, price behavior, and protocol-level activity
          without moving across multiple disconnected tools. This layout is intended for users who need a
          clear starting point before they execute swaps, rebalance positions, or review governance status.
        </p>
        <p>
          Data on this page is designed to support practical decisions under changing market conditions.
          Operators can inspect observed liquidity depth, watch updates tied to contract state, and verify
          context before committing transactions. The dashboard is not investment advice; it is an interface
          for surfacing relevant metrics that improve auditability and reduce blind execution risk.
        </p>
        <p>
          RAUM maintains a workflow where dashboard context leads into route-specific actions. After review,
          users can continue to the Swap route for execution, the Pools route for range management, or the
          Governance route for proposal tracking. Terminal diagnostics are available for technical checks and
          lower-level state visibility when a deeper inspection path is required.
        </p>
        <p>
          Support and trust resources are published on dedicated public pages. Users can review protocol
          context on the About page, report issues through the Contact page, and inspect policy language on
          the Privacy page. These pages are cross-linked to maintain crawlability and provide clear channels
          for operational communication.
        </p>
        <p>
          Teams running frequent market operations can use this dashboard as a preflight checkpoint before
          each action batch. Confirming current conditions, expected behavior, and dependency health before
          execution helps lower incident rates and simplifies post-trade review. The dashboard is maintained
          as a continuously updated reference surface rather than a static marketing page.
        </p>
      </section>
      <DashboardView />
    </>
  );
}
