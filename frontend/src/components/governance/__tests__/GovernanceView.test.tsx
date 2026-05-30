import React from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GovernanceView } from "../GovernanceView";
import { renderWithI18n } from "@/test/renderWithI18n";

const mockUseStellar = vi.fn();
const mockUseIsDesktop = vi.fn();

vi.mock("@/context/StellarContext", () => ({
  useStellar: () => mockUseStellar(),
}));

vi.mock("@/hooks/useIsDesktop", () => ({
  useIsDesktop: () => mockUseIsDesktop(),
}));

vi.mock("framer-motion", () => {
  const Mock = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  );
  return {
    motion: new Proxy(
      {},
      {
        get: () => Mock,
      }
    ),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  };
});

const makeProposalResult = (id: bigint, title: string, description: string) => ({
  result: {
    id,
    title,
    desc: description,
    status: { tag: "Active" },
    for_votes: 0n,
    against_votes: 0n,
    vote_end: BigInt(Math.floor(Date.now() / 1000) + 86400),
  },
});

describe("GovernanceView", () => {
  beforeEach(() => {
    mockUseStellar.mockReset();
    mockUseIsDesktop.mockReset();
    mockUseIsDesktop.mockReturnValue(false);
  });

  it("shows proposal #2 even when proposal #1 is missing", async () => {
    const getProposal = vi.fn().mockImplementation(async ({ proposal_id }: { proposal_id: bigint }) => {
      if (proposal_id === 2n) {
        return makeProposalResult(2n, "Fee switch implementation", "Proposal two");
      }
      throw new Error("not found");
    });

    mockUseStellar.mockReturnValue({
      governance: { get_proposal: getProposal },
      address: "GUSER",
    });

    renderWithI18n(<GovernanceView />);

    await waitFor(() => {
      expect(screen.getByText(/Proposal #2/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Proposal #1/i)).not.toBeInTheDocument();
  });

  it("filters proposals using search input", async () => {
    const getProposal = vi.fn().mockImplementation(async ({ proposal_id }: { proposal_id: bigint }) => {
      if (proposal_id === 1n) {
        return makeProposalResult(1n, "Alpha proposal", "Liquidity update");
      }
      if (proposal_id === 2n) {
        return makeProposalResult(2n, "Beta proposal", "Fee policy update");
      }
      throw new Error("not found");
    });

    mockUseStellar.mockReturnValue({
      governance: { get_proposal: getProposal },
      address: "GUSER",
    });

    renderWithI18n(<GovernanceView />);

    await waitFor(() => {
      expect(screen.getByText("Alpha proposal")).toBeInTheDocument();
      expect(screen.getByText("Beta proposal")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const searchInput = screen.getByRole("textbox", { name: /search proposals/i });
    await user.type(searchInput, "beta");

    await waitFor(() => {
      expect(screen.getByText("Beta proposal")).toBeInTheDocument();
      expect(screen.queryByText("Alpha proposal")).not.toBeInTheDocument();
    });
  });

  it("opens proposal details popup and shows full content", async () => {
    const longDesc =
      "1. Executive Summary This proposal outlines the activation of the protocol fee switch for RaumFi CLMM V3 pools.";
    const getProposal = vi.fn().mockImplementation(async ({ proposal_id }: { proposal_id: bigint }) => {
      if (proposal_id === 2n) {
        return makeProposalResult(2n, "RaumFi Fee Switch", longDesc);
      }
      throw new Error("not found");
    });

    mockUseStellar.mockReturnValue({
      governance: { get_proposal: getProposal, vote: vi.fn() },
      address: "GUSER",
    });

    renderWithI18n(<GovernanceView />);

    await waitFor(() => {
      expect(screen.getByText("RaumFi Fee Switch")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /view details/i }));

    await waitFor(() => {
      const dialog = screen.getByRole("dialog", { name: /proposal details/i });
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText(longDesc)).toBeInTheDocument();
    });
  });
});
