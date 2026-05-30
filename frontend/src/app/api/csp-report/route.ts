export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CspEnvelope = {
  "csp-report"?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  let body: CspEnvelope | null = null;

  try {
    body = (await request.json()) as CspEnvelope;
  } catch {
    body = null;
  }

  const report = body?.["csp-report"] ?? body;

  const safeReport = {
    documentUri: report?.["document-uri"],
    violatedDirective: report?.["violated-directive"],
    effectiveDirective: report?.["effective-directive"],
    blockedUri: report?.["blocked-uri"],
    disposition: report?.disposition,
    userAgent: request.headers.get("user-agent"),
    receivedAt: new Date().toISOString(),
  };

  console.warn("[CSP_REPORT]", JSON.stringify(safeReport));

  return new Response(null, { status: 204 });
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      endpoint: "/api/csp-report",
    },
    { status: 200 }
  );
}
