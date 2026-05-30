"use client";

import React from "react";
import { Providers } from "@/components/Providers";
import { TopNav } from "@/components/ui/TopNav";
import { Footer } from "@/components/ui/Footer";
import { BackgroundDecor } from "@/components/ui/BackgroundDecor";
import { SmoothScroll } from "@/components/ui/SmoothScroll";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <SmoothScroll />
      <div className="app-shell relative min-h-screen overflow-hidden flex flex-col lg:h-screen lg:overflow-hidden">
        <BackgroundDecor />
        <TopNav />
        <main id="main-content" className="relative mx-auto w-full max-w-[1400px] flex-1 min-h-0 overflow-hidden px-4 pb-10 pt-6 md:px-10 lg:px-8 lg:pt-4 lg:pb-4">
          {children}
        </main>
        <Footer />
      </div>
    </Providers>
  );
}
