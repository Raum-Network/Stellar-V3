import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "@/lib/seo";

const PUBLISHED_AT = "2026-02-12T00:00:00.000Z";
const MODIFIED_AT = "2026-02-12T00:00:00.000Z";

export const metadata: Metadata = createPageMetadata({
  title: "Contact | RAUM CLMM DEX Support and Security Desk",
  description:
    "Get support, report security issues, and request operational guidance for RAUM CLMM DEX through dedicated channels maintained for production users.",
  path: "/contact",
  type: "article",
  publishedTime: PUBLISHED_AT,
  modifiedTime: MODIFIED_AT,
});

export default function ContactPage() {
  return (
    <section className="mx-auto h-full min-h-0 w-full max-w-4xl">
      <article className="lux-card custom-scrollbar h-full min-h-0 overflow-y-auto p-6 md:p-8">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Contact</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          This page lists official channels for RAUM CLMM DEX support and incident reporting. Use these
          contacts for integration questions, operational issues, and user-facing defects encountered on
          the production interface. Clear and structured reports improve triage quality and reduce response
          time, especially during periods of high network or market activity.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          When submitting a support request, include relevant context: wallet type, network, route visited,
          transaction hash (if available), and a concise summary of expected versus observed behavior.
          Screenshots or logs can help reproduce issues faster. Avoid sharing private keys, recovery phrases,
          or other sensitive wallet credentials. RAUM support will never request those secrets.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Security reports are handled with elevated priority. If you discover a potential vulnerability,
          send details through the security address below and include reproducibility steps, impact estimate,
          and suggested mitigations if known. Responsible disclosure helps protect users and allows time for
          coordinated fixes, validation, and communication.
        </p>
        <ul className="mt-6 space-y-3 text-sm text-[var(--foreground)]">
          <li>
            General Inquiries:{" "}
            <a className="underline underline-offset-4" href="mailto:support@raum.network">
              support@raum.network
            </a>
          </li>
          <li>
            Security Reports:{" "}
            <a className="underline underline-offset-4" href="mailto:security@raum.network">
              security@raum.network
            </a>
          </li>
          <li>
            Legacy Interface:{" "}
            <a
              className="underline underline-offset-4"
              href="https://v1.dex.raum.network"
              target="_blank"
              rel="noopener noreferrer"
            >
              v1.dex.raum.network
            </a>
          </li>
        </ul>
        <p className="mt-6 text-sm leading-7 text-[var(--muted)]">
          Related public references are available on the About and Privacy pages. The About page describes
          product scope and governance context, while the Privacy page explains data-handling boundaries and
          user expectations. Keeping these routes interconnected helps users and auditors quickly locate the
          right information without leaving the primary domain.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          Response timing depends on issue type and severity. Security reports and production outages are
          prioritized ahead of general feature questions. For urgent requests, include complete reproducible
          details in the first message so triage can start without follow-up delays. Clear reporting helps the
          team classify impact, route ownership, and publish corrective actions more efficiently.
        </p>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          If your request references a transaction, include the hash and approximate timestamp to speed
          verification against network and application logs.
        </p>
        <nav aria-label="Related pages" className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
          <Link href="/about" className="underline underline-offset-4">About</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
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
          Response windows vary by request type and network load.
        </p>
        <p className="sr-only">
          Contact page owner: RAUM operations team. Channels on this page are maintained for production support,
          incident response, and security disclosure.
        </p>
      </article>
    </section>
  );
}
