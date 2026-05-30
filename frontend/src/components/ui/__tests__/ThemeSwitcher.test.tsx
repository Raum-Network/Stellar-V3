import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ThemeSwitcher } from "../ThemeSwitcher";
import { renderWithI18n } from "@/test/renderWithI18n";

const mockUseTheme = vi.fn();

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => mockUseTheme(),
}));

describe("ThemeSwitcher", () => {
  it("shows light label when dark theme", () => {
    mockUseTheme.mockReturnValue({ theme: "dark", toggleTheme: vi.fn() });
    renderWithI18n(<ThemeSwitcher />);
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByTitle(/Switch to Light Mode/i)).toBeInTheDocument();
  });

  it("calls toggle on click", async () => {
    const toggleTheme = vi.fn();
    mockUseTheme.mockReturnValue({ theme: "light", toggleTheme });
    const user = userEvent.setup();
    renderWithI18n(<ThemeSwitcher />);
    await user.click(screen.getByRole("button"));
    expect(toggleTheme).toHaveBeenCalled();
  });
});
