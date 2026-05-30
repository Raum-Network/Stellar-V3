import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/test/**",
        "src/**/__tests__/**",
        "src/contracts/**",
        "src/i18n/translations.ts",
        "src/app/**",
        "src/instrumentation.ts",
        "src/components/AppShell.tsx",
        "src/components/Providers.tsx",
        "src/components/dashboard/PriceChart.tsx",
        "src/components/governance/**",
        "src/components/pool/PoolView.tsx",
        "src/components/swap/SwapView.tsx",
        "src/components/swap/SettingsModal.tsx",
        "src/components/terminal/**",
        "src/context/StellarContext.tsx",
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
