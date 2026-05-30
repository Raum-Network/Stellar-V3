import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIsDesktop } from "../useIsDesktop";

describe("useIsDesktop", () => {
  it("tracks media query changes", () => {
    let changeHandler: ((event: { matches: boolean }) => void) | null = null;
    let matches = true;

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        media: "(min-width: 1024px)",
        get matches() {
          return matches;
        },
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_name: string, cb: (event: { matches: boolean }) => void) => {
          changeHandler = cb;
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);

    matches = false;
    act(() => {
      changeHandler?.({ matches: false });
    });
    expect(result.current).toBe(false);
  });
});
