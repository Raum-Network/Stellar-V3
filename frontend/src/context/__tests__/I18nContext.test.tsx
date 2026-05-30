import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../I18nContext";

function Consumer() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="translated">{t("dashboard.title")}</span>
      <span data-testid="interpolated">
        {t("dashboard.logs.poolSync", { price: "1.2345" })}
      </span>
      <span data-testid="missing">{t("missing.key")}</span>
      <span data-testid="default-fallback">{t("footer.poolTools")}</span>
      <button onClick={() => setLanguage("ar")}>set-ar</button>
    </div>
  );
}

describe("I18nContext", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "";
    document.documentElement.dir = "ltr";
  });

  it("throws when hook is used outside provider", () => {
    expect(() => renderHook(() => useI18n())).toThrow(
      "useI18n must be used within I18nProvider"
    );
  });

  it("initializes from localStorage and applies html lang/dir", () => {
    window.localStorage.setItem("raum_language", "ar-EG");

    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    );

    expect(screen.getByTestId("language")).toHaveTextContent("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("translates, interpolates, and falls back to key if missing", async () => {
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    );

    expect(screen.getByTestId("translated")).toHaveTextContent("RAUM Liquidity Suite");
    expect(screen.getByTestId("interpolated")).toHaveTextContent(
      "POOL_SYNC: PRICE 1.2345 USDC/XLM"
    );
    expect(screen.getByTestId("missing")).toHaveTextContent("missing.key");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "set-ar" }));

    expect(screen.getByTestId("language")).toHaveTextContent("ar");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("falls back to default language when stored language is invalid", () => {
    window.localStorage.setItem("raum_language", "xx-YY");

    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    );

    expect(screen.getByTestId("language")).toHaveTextContent("en");
  });

  it("falls back to default-language translation when key is missing in active language", () => {
    window.localStorage.setItem("raum_language", "es");

    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    );

    expect(screen.getByTestId("language")).toHaveTextContent("es");
    expect(screen.getByTestId("default-fallback")).toHaveTextContent("Pool Tools");
  });
});
