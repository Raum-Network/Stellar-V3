import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Footer } from "../Footer";
import { renderWithI18n } from "@/test/renderWithI18n";

const mockUseStellar = vi.fn();

vi.mock("@/context/StellarContext", () => ({
  useStellar: () => mockUseStellar(),
}));

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("Footer", () => {
  beforeEach(() => {
    mockUseStellar.mockReturnValue({
      latestLedger: 123456,
      latestLedgerHash: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
      address: "GA123",
    });
    mockUsePathname.mockReturnValue("/pools");
  });

  it("renders ledger details and hash preview", () => {
    renderWithI18n(<Footer />);

    expect(screen.getByText(/Ledger: 123,456/)).toBeInTheDocument();
    expect(screen.getByText(/Hash: ABCDEF\.\.\./)).toBeInTheDocument();
  });

  it("dispatches recovery event when enabled", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener("pools:recovery-toggle", handler);

    renderWithI18n(<Footer />);

    await user.click(screen.getByRole("button", { name: /Site Links/i }));
    await user.click(screen.getByRole("button", { name: /Recovery Tools/i }));
    expect(handler).toHaveBeenCalled();

    window.removeEventListener("pools:recovery-toggle", handler);
  });

  it("dispatches refresh and sync events from pool tools", async () => {
    const user = userEvent.setup();
    const refreshHandler = vi.fn();
    const syncHandler = vi.fn();
    window.addEventListener("pools:positions-refresh-local", refreshHandler);
    window.addEventListener("pools:positions-sync-chain", syncHandler);

    renderWithI18n(<Footer />);

    await user.click(screen.getByRole("button", { name: /Site Links/i }));
    await user.click(screen.getByRole("button", { name: /Refresh from local storage/i }));
    expect(refreshHandler).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Site Links/i }));
    await user.click(screen.getByRole("button", { name: /Sync from blockchain/i }));
    expect(syncHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener("pools:positions-refresh-local", refreshHandler);
    window.removeEventListener("pools:positions-sync-chain", syncHandler);
  });

  it("disables recovery button when no address", async () => {
    mockUseStellar.mockReturnValue({
      latestLedger: null,
      latestLedgerHash: null,
      address: null,
    });

    renderWithI18n(<Footer />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Site Links/i }));
    const button = screen.getByRole("button", { name: /Recovery Tools/i });
    expect(button).toBeDisabled();
  });

  it("toggles mobile details section", async () => {
    const user = userEvent.setup();
    renderWithI18n(<Footer />);

    await user.click(screen.getByRole("button", { name: /Details/i }));
    expect(screen.getAllByText(/Audit Logs/i).length).toBeGreaterThan(0);
  });

  it("does not show pool tools in site links outside pools tab", async () => {
    mockUsePathname.mockReturnValue("/swap");
    const user = userEvent.setup();

    renderWithI18n(<Footer />);

    await user.click(screen.getByRole("button", { name: /Site Links/i }));
    expect(screen.queryByRole("button", { name: /Recovery Tools/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh from local storage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sync from blockchain/i })).not.toBeInTheDocument();
  });

  it("closes site links menu on outside click", async () => {
    const user = userEvent.setup();
    renderWithI18n(<Footer />);

    await user.click(screen.getByRole("button", { name: /Site Links/i }));
    expect(screen.getByRole("button", { name: /Recovery Tools/i })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: /Recovery Tools/i })).not.toBeInTheDocument();
  });

  it("shows up arrow when closed and down arrow when site links is open", async () => {
    const user = userEvent.setup();
    renderWithI18n(<Footer />);

    const siteLinksButton = screen.getByRole("button", { name: /Site Links/i });
    const icon = siteLinksButton.querySelector("svg");
    expect(icon).toBeTruthy();
    expect(icon?.className.baseVal ?? "").toContain("rotate-180");

    await user.click(siteLinksButton);
    expect(icon?.className.baseVal ?? "").not.toContain("rotate-180");
  });
});
