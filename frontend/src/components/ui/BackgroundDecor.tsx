"use client";

import React from "react";

export function BackgroundDecor() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -left-32 top-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(176,141,87,0.35),transparent_70%)] blur-2xl opacity-70 float-slow" />
      <div className="absolute right-[-10%] top-0 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(111,127,106,0.3),transparent_70%)] blur-2xl opacity-60 float-slow" />
      <div className="absolute bottom-[-20%] left-[30%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(176,141,87,0.25),transparent_70%)] blur-3xl opacity-50 float-slow" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_40%)] opacity-40" />
    </div>
  );
}
