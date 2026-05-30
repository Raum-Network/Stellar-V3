import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { renderWithI18n } from "@/test/renderWithI18n";

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens dropdown and changes language", async () => {
    const user = userEvent.setup();
    renderWithI18n(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /^EN$/ }));
    await user.click(screen.getByRole("button", { name: /हिन्दी HI/i }));

    await waitFor(() => {
      expect(screen.getByText("HI")).toBeInTheDocument();
    });
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    renderWithI18n(<LanguageSwitcher />);

    await user.click(screen.getByRole("button", { name: /^EN$/ }));
    expect(screen.getByText("English")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("English")).not.toBeInTheDocument();
  });
});
