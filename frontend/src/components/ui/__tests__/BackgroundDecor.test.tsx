import React from "react";
import { render } from "@testing-library/react";
import { BackgroundDecor } from "../BackgroundDecor";

describe("BackgroundDecor", () => {
  it("renders decorative layers", () => {
    const { container } = render(<BackgroundDecor />);
    const wrapper = container.querySelector("div[aria-hidden]");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.children.length).toBeGreaterThanOrEqual(4);
  });
});
