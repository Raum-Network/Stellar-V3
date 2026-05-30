import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const cspMode = process.env.CSP_MODE || "report-only";
const cspReportEndpoint = "/api/csp-report";
const cspReportToGroup = "csp-endpoint";

const allowedConnectSources = [
  "'self'",
  "https://soroban-testnet.stellar.org",
  "https://horizon-testnet.stellar.org",
  "https://api.coingecko.com",
  "https://relay.walletconnect.com",
  "wss://relay.walletconnect.com",
  "https://*.walletconnect.com",
  "wss://*.walletconnect.com",
];

function buildCsp({ strict }) {
  const directives = [
    "default-src 'self'",
    strict
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    `connect-src ${allowedConnectSources.join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
    `report-uri ${cspReportEndpoint}`,
    `report-to ${cspReportToGroup}`,
  ];

  return directives.join("; ");
}

const baselineCsp = buildCsp({ strict: false });
const strictCsp = buildCsp({ strict: true });
const reportToHeader = JSON.stringify({
  group: cspReportToGroup,
  max_age: 10886400,
  endpoints: [{ url: cspReportEndpoint }],
});

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: [
    "governance",
    "factory",
    "router",
    "position_manager",
    "pool",
    "js-sha256",
    "@bluxcc/core",
    "@bluxcc/react",
  ],
  webpack: (config, { webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stellar/stellar-base": path.resolve(
        __dirname,
        "node_modules/@stellar/stellar-base"
      ),
    };

    // Browser fallbacks required by Soroban client dependencies.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve("buffer/"),
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
    };

    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: [require.resolve("buffer/"), "Buffer"],
        process: "process/browser",
      })
    );

    return config;
  },
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    const cspHeaders =
      cspMode === "enforce"
        ? [{ key: "Content-Security-Policy", value: strictCsp }]
        : [
            { key: "Content-Security-Policy", value: baselineCsp },
            { key: "Content-Security-Policy-Report-Only", value: strictCsp },
          ];

    return [
      {
        source: "/(.*)",
        headers: [
          ...cspHeaders,
          {
            key: "Reporting-Endpoints",
            value: `${cspReportToGroup}="${cspReportEndpoint}"`,
          },
          {
            key: "Report-To",
            value: reportToHeader,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
