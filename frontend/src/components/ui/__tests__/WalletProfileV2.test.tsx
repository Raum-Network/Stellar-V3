import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { WalletProfileV2 } from "../WalletProfileV2";
import { renderWithI18n } from "@/test/renderWithI18n";

const mockUseStellar = vi.fn();

vi.mock("@/context/StellarContext", () => ({
  useStellar: () => mockUseStellar(),
}));

vi.mock("@/components/ui/ThemeSwitcher", () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher-inline" />,
}));

vi.mock("@/components/ui/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher-inline" />,
}));

describe("WalletProfileV2", () => {
  it("shows connect button when not connected", async () => {
    const connect = vi.fn();
    mockUseStellar.mockReturnValue({
      address: null,
      connect,
      disconnect: vi.fn(),
      connecting: false,
    });

    const user = userEvent.setup();
    renderWithI18n(<WalletProfileV2 />);

    await user.click(screen.getByRole("button", { name: /Connect Wallet/i }));
    expect(connect).toHaveBeenCalled();
  });

  it("opens dropdown and handles copy/disconnect", async () => {
    const disconnect = vi.fn();
    mockUseStellar.mockReturnValue({
      address: "GABCDE1234567890",
      connect: vi.fn(),
      disconnect,
      connecting: false,
    });

    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderWithI18n(<WalletProfileV2 />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/Connected Wallet/i)).toBeInTheDocument();
    expect(screen.getByTestId("theme-switcher-inline")).toBeInTheDocument();
    expect(screen.getByTestId("language-switcher-inline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Copy Address/i }));
    expect(writeText).toHaveBeenCalledWith("GABCDE1234567890");

    await user.click(screen.getByRole("button", { name: /Disconnect/i }));
    expect(disconnect).toHaveBeenCalled();
  });

  it("shows syncing state when wallet is not ready", () => {
    mockUseStellar.mockReturnValue({
      address: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      connecting: true,
    });

    renderWithI18n(<WalletProfileV2 />);
    expect(screen.getByRole("button", { name: /Syncing/i })).toBeDisabled();
  });

  it("closes dropdown on outside click", async () => {
    mockUseStellar.mockReturnValue({
      address: "GABCDE1234567890",
      connect: vi.fn(),
      disconnect: vi.fn(),
      connecting: false,
    });

    const user = userEvent.setup();
    renderWithI18n(<WalletProfileV2 />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/Connected Wallet/i)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/Connected Wallet/i)).not.toBeInTheDocument();
  });
});
