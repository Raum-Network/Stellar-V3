import React from "react";
import { render, RenderOptions } from "@testing-library/react";
import { I18nProvider } from "@/context/I18nContext";

export const renderWithI18n = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) => render(<I18nProvider>{ui}</I18nProvider>, options);
