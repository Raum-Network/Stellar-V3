import type { Metadata } from "next";
import { TerminalView } from "@/components/terminal/TerminalView";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Terminal | RAUM CLMM DEX Operations and Status Console",
  description:
    "Use the RAUM terminal console for network checks, contract status queries, and wallet-linked diagnostics that support troubleshooting and validation.",
  path: "/terminal",
});

export default function TerminalPage() {
  return (
    <>
      <section className="sr-only">
        <h2>Terminal Diagnostics Route</h2>
        <p>
          The Terminal route provides command-style diagnostics for RAUM CLMM DEX. It is designed for users
          who need quick network checks, contract address visibility, and wallet-aware status feedback during
          troubleshooting. Rather than replacing graphical workflows, this route supplements them with a
          concise interface focused on operational confirmation and reproducible checks.
        </p>
        <p>
          Available commands include balance lookups, pool status checks, network health queries, and address
          inspection. These tools are useful when monitoring staged rollouts, validating environment settings,
          or confirming that connected services are returning expected responses. Operators can use this page
          during incident triage or routine maintenance cycles.
        </p>
        <p>
          Terminal workflows are linked with the broader application. After diagnostics, users can return to
          Dashboard for market context, move to Swap for execution, or manage range positions in Pools.
          Governance remains available for proposal review and voting activity that may impact runtime
          behavior. This cross-route flow supports continuity between observation and action.
        </p>
        <p>
          Additional public references are provided through About, Contact, and Privacy pages. These routes
          establish project context, publish support channels, and document policy boundaries so users can
          operate with clear expectations and escalation options when issues are identified.
        </p>
        <p>
          Teams can use the terminal route as a repeatable checklist during deployment verification and
          incident response. Running the same command set before and after changes helps confirm that contract
          endpoints, wallet state, and network responses remain consistent. When combined with dashboard and
          pool workflows, this route strengthens operational confidence by providing a low-friction path for
          direct status validation without external tooling.
        </p>
        <p>
          Command history also helps with support handoffs, because responders can see what checks were run
          before an issue was escalated and avoid duplicating the same diagnostic sequence.
          This improves continuity.
        </p>
      </section>
      <TerminalView />
    </>
  );
}
