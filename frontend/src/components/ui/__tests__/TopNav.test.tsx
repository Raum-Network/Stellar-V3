import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { TopNav } from "../TopNav";
import { renderWithI18n } from "@/test/renderWithI18n";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        // Preserve test click handlers attached by components.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props as any).onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/ThemeSwitcher", () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher" />,
}));

vi.mock("@/components/ui/WalletProfileV2", () => ({
  WalletProfileV2: () => <div data-testid="wallet-profile" />,
}));

describe("TopNav", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/pools");
  });

  it("renders navigation links and active state", () => {
    renderWithI18n(<TopNav />);
    expect(screen.getByText("Pools")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("opens mobile menu", async () => {
    const user = userEvent.setup();
    renderWithI18n(<TopNav />);

    await user.click(screen.getByRole("button", { name: /Menu/i }));
    expect(screen.getByText(/Navigation/i)).toBeInTheDocument();
    expect(screen.getAllByText("Pools").length).toBeGreaterThan(0);
  });

  it("closes mobile menu when a nav link is selected", async () => {
    const user = userEvent.setup();
    renderWithI18n(<TopNav />);

    await user.click(screen.getByRole("button", { name: /Menu/i }));
    const poolsLinks = screen.getAllByRole("link", { name: "Pools" });
    await user.click(poolsLinks[poolsLinks.length - 1]);

    expect(screen.queryByText(/Navigation/i)).not.toBeInTheDocument();
  });

  it("marks dashboard as active when pathname is root", () => {
    mockUsePathname.mockReturnValue("/");
    renderWithI18n(<TopNav />);

    const dashboardLink = screen.getAllByRole("link", { name: "Dashboard" })[0];
    expect(dashboardLink.className).toContain("bg-[var(--surface-2)]");
  });
});
