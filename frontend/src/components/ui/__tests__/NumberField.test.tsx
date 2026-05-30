import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "../NumberField";
import { renderWithI18n } from "@/test/renderWithI18n";

function setup(props: Partial<React.ComponentProps<typeof NumberField>> = {}) {
  const onChange = vi.fn();
  const utils = renderWithI18n(
    <NumberField value="1" onChange={onChange} step={0.1} min={0} max={2} {...props} />
  );
  return { onChange, ...utils };
}

describe("NumberField", () => {
  it("does not render spinner step buttons", () => {
    setup();
    expect(screen.queryByLabelText("Increase value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Decrease value")).not.toBeInTheDocument();
  });

  it("emits changes from direct typing", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "15");
    expect(onChange).toHaveBeenLastCalledWith("15");
  });

  it("renders suffix when provided", () => {
    setup({ suffix: "XLM" });
    expect(screen.getByText("XLM")).toBeInTheDocument();
  });

  it("does not change when disabled", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ disabled: true });
    const input = screen.getByRole("spinbutton");

    await user.type(input, "2");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports object refs and plain variant rendering", () => {
    const ref = React.createRef<HTMLInputElement>();
    renderWithI18n(
      <NumberField
        ref={ref}
        value="1"
        onChange={vi.fn()}
        variant="plain"
        suffix="USDC"
      />
    );

    expect(ref.current).not.toBeNull();
    expect(ref.current?.className).toContain("bg-transparent");
    expect(screen.getByText("USDC")).toBeInTheDocument();
  });

  it("supports function refs", () => {
    const refFn = vi.fn();
    renderWithI18n(<NumberField value="1" onChange={vi.fn()} ref={refFn} step={0} />);
    expect(refFn).toHaveBeenCalled();
  });
});
