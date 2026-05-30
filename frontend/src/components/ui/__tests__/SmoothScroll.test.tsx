import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { SmoothScroll } from "../SmoothScroll";
import Lenis from "lenis";

vi.mock("lenis", () => ({
  default: vi.fn().mockImplementation(() => ({
    raf: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe("SmoothScroll", () => {
  it("does nothing on large screens", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: true }),
    });

    render(<SmoothScroll />);
    expect(Lenis).not.toHaveBeenCalled();
  });

  it("initializes Lenis on small screens", () => {
    const raf = vi.fn();
    const destroy = vi.fn();
    vi.mocked(Lenis).mockImplementation(
      () =>
        ({
          raf,
          destroy,
        }) as unknown as Lenis
    );

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: () => ({ matches: false }),
    });
    let firstFrame = true;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      if (firstFrame) {
        firstFrame = false;
        callback(16);
      }
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const { unmount } = render(<SmoothScroll />);
    expect(Lenis).toHaveBeenCalled();
    expect(raf).toHaveBeenCalledWith(16);
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
