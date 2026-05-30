import packageJson from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = {
    app: "clmm.raum.network",
    version: process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || "unknown",
    buildTime:
      process.env.NEXT_PUBLIC_BUILD_TIME ||
      process.env.BUILD_TIME ||
      process.env.VERCEL_GIT_COMMIT_DATE ||
      "unknown",
    buildSha:
      process.env.NEXT_PUBLIC_BUILD_SHA ||
      process.env.BUILD_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "unknown",
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
