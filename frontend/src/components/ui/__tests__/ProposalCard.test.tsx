import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ProposalCard } from "../ProposalCard";
import { renderWithI18n } from "@/test/renderWithI18n";

vi.mock("framer-motion", () => ({
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  },
}));

describe("ProposalCard", () => {
  it("renders vote breakdown and triggers yes/no votes", async () => {
    const onVoteYes = vi.fn();
    const onVoteNo = vi.fn();
    const user = userEvent.setup();

    renderWithI18n(
      <ProposalCard
        id="42"
        title="Add fee tier"
        description="Proposal details"
        status="Active"
        forVotes={75}
        againstVotes={25}
        endTime={Date.now() + 86400000}
        onVoteYes={onVoteYes}
        onVoteNo={onVoteNo}
        onViewDetails={() => undefined}
      />
    );

    expect(screen.getByText(/Proposal #42/i)).toBeInTheDocument();
    expect(screen.getByText(/75% support/i)).toBeInTheDocument();
    expect(screen.getByText(/25% oppose/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Yes/i }));
    expect(onVoteYes).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /No/i }));
    expect(onVoteNo).toHaveBeenCalledTimes(1);
  });

  it("shows closed status when past endTime", () => {
    renderWithI18n(
      <ProposalCard
        id="1"
        title="Past vote"
        description="Closed proposal"
        status="Defeated"
        forVotes={0}
        againstVotes={0}
        endTime={Date.now() - 1000}
        onVoteYes={() => undefined}
        onVoteNo={() => undefined}
        onViewDetails={() => undefined}
      />
    );

    expect(screen.getAllByText(/Closed/i).length).toBeGreaterThan(0);
  });
});
