import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/seo";

const PUBLISHED_AT = "2026-02-12T00:00:00.000Z";
const MODIFIED_AT = "2026-02-12T00:00:00.000Z";

export const metadata: Metadata = createPageMetadata({
  title: "About | RAUM CLMM DEX Protocol and Team Context",
  description:
    "Learn how RAUM CLMM DEX operates on Stellar, who maintains the interface, and which governance, support, and policy paths users can rely on in production.",
  path: "/about",
  type: "article",
  publishedTime: PUBLISHED_AT,
  modifiedTime: MODIFIED_AT,
});

export default function AboutPage() {
  return (
    <section className="mx-auto h-full min-h-0 w-full max-w-4xl">
      <article className="lux-card custom-scrollbar h-full min-h-0 overflow-y-auto p-6 md:p-8">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">About RAUM CLMM DEX</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          RAUM CLMM DEX is a concentrated-liquidity exchange interface designed for the Stellar ecosystem.
          The product focuses on practical operations for traders, liquidity providers, and protocol
          participants who need a single workspace for execution, monitoring, and governance context.
          Instead of separating these tasks into disconnected dashboards, RAUM presents route-specific
          tools that share consistent navigation and reporting patterns.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Concentrated liquidity allows providers to define ranges where capital remains active. This can
          improve capital efficiency compared with uniform liquidity models, but it also increases the need
          for active oversight. RAUM addresses that requirement with pool-focused position tooling, quote and
          slippage visibility for swaps, and monitoring surfaces that expose protocol and network state.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          The public interface includes dedicated routes for Dashboard, Swap, Pools, Governance, and Terminal.
          Each route is maintained as part of an operational workflow: users can review context, execute
          actions, and validate outcomes with minimal context switching. Governance tools are provided to
          support transparent proposal lifecycle management and visible vote outcomes over protocol changes.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          This website is maintained as production software and is intended for informed users who understand
          wallet security, transaction finality, and smart-contract interaction risk. RAUM does not hold user
          custody credentials through this interface. Users remain responsible for wallet key management and
          should verify transaction details before signing. The team publishes support and policy references to
          reduce ambiguity around operations, reporting, and acceptable use.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          For support escalations and security issues, refer to the Contact page. For policy expectations and
          data-handling details, review the Privacy page. These pages are intentionally cross-linked so users,
          auditors, and integration teams can find operational context without relying on off-site references.
          The platform will continue to publish maintenance updates and route-level improvements as deployment
          and protocol requirements evolve.
        </p>
        <p className="mt-6 text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Published: February 12, 2026 | Last updated: February 12, 2026
        </p>
        <nav aria-label="Related pages" className="mt-6 flex flex-wrap gap-3 pb-2 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
          <Link href="/dashboard" className="underline underline-offset-4">Dashboard</Link>
          <Link href="/swap" className="underline underline-offset-4">Swap</Link>
          <Link href="/pools" className="underline underline-offset-4">Pools</Link>
          <Link href="/governance" className="underline underline-offset-4">Governance</Link>
          <Link href="/terminal" className="underline underline-offset-4">Terminal</Link>
          <Link href="/contact" className="underline underline-offset-4">Contact</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
        </nav>
        <p className="sr-only">
          About page author: RAUM operations team. This page exists to document interface purpose, maintenance
          scope, public support channels, and policy references for users and compliance reviewers.
        </p>
      </article>
    </section>
  );
}
