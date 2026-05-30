import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/seo";

const PUBLISHED_AT = "2026-02-12T00:00:00.000Z";
const MODIFIED_AT = "2026-02-12T00:00:00.000Z";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy | RAUM CLMM DEX Data and Policy Commitments",
  description:
    "Review RAUM CLMM DEX privacy commitments, including wallet data boundaries, local storage behavior, and communication channels for privacy requests.",
  path: "/privacy",
  type: "article",
  publishedTime: PUBLISHED_AT,
  modifiedTime: MODIFIED_AT,
});

export default function PrivacyPage() {
  return (
    <section className="mx-auto h-full min-h-0 w-full max-w-4xl">
      <article className="lux-card custom-scrollbar h-full min-h-0 overflow-y-auto p-6 md:p-8">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          RAUM CLMM DEX is a non-custodial blockchain interface. We do not hold user private keys or control
          user assets. To operate core functionality, the interface may process publicly available wallet
          addresses, transaction identifiers, and chain state relevant to swaps, pool positions, governance,
          and diagnostics. This processing is limited to delivering product functionality and support.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Browser-side preferences such as language, theme, and selected interface options may be stored
          locally to improve usability. These values are not wallet credentials. Users should still protect
          device security, validate signing prompts, and avoid exposing seed phrases or private keys to any
          third party. RAUM support will not request sensitive wallet secrets.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          External wallets, RPC providers, analytics endpoints, and third-party services operate under their
          own terms and privacy policies. RAUM is not responsible for independent policies applied by these
          providers. Users should review those policies directly before connecting wallets or using optional
          integrations that transmit data outside this domain.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          If you need support related to privacy requests, contact{" "}
          <a className="underline underline-offset-4" href="mailto:privacy@raum.network">
            privacy@raum.network
          </a>
          . Please include enough context for triage, such as route visited, date and time, and the wallet
          address involved when relevant. We will evaluate requests according to operational constraints and
          legal obligations applicable to the service.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Additional references are available on the About and Contact pages. About provides project context
          and operational scope, while Contact lists support and security channels for reporting issues.
          These routes are intentionally cross-linked to maintain transparency and make trust information
          discoverable through both navigation and search crawling.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Policy updates are published with an updated date marker so users can track changes over time.
        </p>
        <nav aria-label="Related pages" className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
          <Link href="/about" className="underline underline-offset-4">About</Link>
          <Link href="/contact" className="underline underline-offset-4">Contact</Link>
          <Link href="/dashboard" className="underline underline-offset-4">Dashboard</Link>
          <Link href="/swap" className="underline underline-offset-4">Swap</Link>
          <Link href="/pools" className="underline underline-offset-4">Pools</Link>
          <Link href="/governance" className="underline underline-offset-4">Governance</Link>
          <Link href="/terminal" className="underline underline-offset-4">Terminal</Link>
        </nav>
        <p className="mt-6 text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Published: February 12, 2026 | Last updated: February 12, 2026
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
          Effective date: February 12, 2026
        </p>
        <p className="sr-only">
          Privacy page owner: RAUM operations team. This page documents data handling for the production
          interface and provides the official privacy support channel.
        </p>
      </article>
    </section>
  );
}
