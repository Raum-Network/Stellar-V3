import type { Metadata } from "next";
import { SwapView } from "@/components/swap/SwapView";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Swap | RAUM CLMM DEX Stellar Token Trade Interface",
  description:
    "Execute Stellar token swaps with RAUM CLMM routing, quote validation, slippage controls, and transparent status from approval through settlement.",
  path: "/swap",
});

export default function SwapPage() {
  return (
    <>
      <section className="sr-only">
        <h2>Swap Route Guide</h2>
        <p>
          The Swap route is the execution surface for token trades on RAUM CLMM DEX. It presents input and
          output amounts, live quote behavior, price impact checks, and transaction status feedback so users
          can move from intent to signed operation with explicit context. Routing is designed for concentrated
          liquidity pools, where available depth can vary based on the active price range.
        </p>
        <p>
          Before submitting a trade, users should review expected output, minimum received amounts, and wallet
          balances. Slippage controls are available to define execution tolerance, and status prompts explain
          each stage including allowance checks, wallet confirmation, and final chain submission. These checks
          are intended to reduce avoidable failures and clarify when intervention is required.
        </p>
        <p>
          Operationally, the swap workflow connects with other public routes. The Dashboard route provides
          market context before execution, while the Pools route supports position adjustments after a trade.
          Governance and Terminal routes are available when users need policy visibility or command-style
          diagnostics on protocol and network state.
        </p>
        <p>
          For support and policy references, RAUM publishes dedicated pages for About, Contact, and Privacy.
          These resources explain ownership context, communication channels, and data-handling expectations.
          Users should verify connected wallet details and network environment before signing transactions.
        </p>
        <p>
          To reduce execution risk, traders should re-check quote freshness if market state changes during
          approval flow. Concentrated-liquidity routing can change output behavior as liquidity moves across
          ranges. The swap interface is designed to expose this risk with transparent status and pricing
          signals so users can decide whether to proceed, adjust parameters, or defer execution.
        </p>
        <p>
          Post-trade review is also recommended: verify received amounts, settlement status, and wallet
          balances before initiating the next operation in a trading sequence.
        </p>
      </section>
      <SwapView />
    </>
  );
}
