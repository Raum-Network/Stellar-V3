"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/context/ThemeContext";
import { StellarProvider } from "@/context/StellarContext";
import { I18nProvider } from "@/context/I18nContext";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <StellarProvider>{children}</StellarProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
