import type { Metadata } from "next";
import { GovernanceView } from "@/components/governance/GovernanceView";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Governance | RAUM CLMM DEX Proposal and Voting Center",
  description:
    "Review active proposals, monitor voting outcomes, and submit governance actions through RAUM CLMM tooling built for transparent protocol decision-making.",
  path: "/governance",
});

export default function GovernancePage() {
  return (
    <>
      <section className="sr-only">
        <h2>Governance Participation Route</h2>
        <p>
          The Governance route supports proposal review and voting workflows for the RAUM CLMM protocol.
          Participants can inspect proposal summaries, monitor voting progress, and submit actions through a
          structured interface intended to keep decision history transparent. Governance actions can affect
          operational parameters, incentive behavior, and long-term protocol direction.
        </p>
        <p>
          When evaluating a proposal, users should review title and description content, confirm relevance to
          current protocol needs, and assess execution risk. This route is designed to make that review easier
          by grouping key metrics and status signals in one place. Wallet connectivity is required before any
          vote or submission action can be finalized.
        </p>
        <p>
          Governance should be considered together with market and pool operations. Users can switch to the
          Dashboard route for live context, the Swap route for execution, and the Pools route for position
          management. Terminal diagnostics can be used when governance decisions require additional technical
          verification from contract-level or network-level observations.
        </p>
        <p>
          Public trust resources remain available across the About, Contact, and Privacy pages. These pages
          document project context, communication channels, and policy references to support responsible
          participation and clear escalation paths for security or operational concerns.
        </p>
        <p>
          Governance quality improves when participants share clear rationale and evaluate proposals against
          measurable outcomes. Contributors should document intended effects, potential tradeoffs, and
          rollback considerations before voting windows close. A disciplined review process reduces rushed
          decisions and helps preserve protocol stability during upgrades, parameter changes, and emergency
          responses. RAUM publishes governance interfaces to support that discipline with transparent state
          tracking, visible participation, and reproducible records for future audits.
        </p>
        <p>
          Proposal authors are encouraged to include implementation dependencies, testing expectations, and
          communication plans so execution teams can coordinate follow-through after voting concludes.
        </p>
      </section>
      <GovernanceView />
    </>
  );
}
