import { describe, expect, it } from "vitest";
import { priceFromTick } from "../price";

describe("priceFromTick", () => {
  it("returns 1 at tick 0", () => {
    expect(priceFromTick(0)).toBe(1);
  });

  it("increases as tick increases", () => {
    expect(priceFromTick(100)).toBeGreaterThan(priceFromTick(0));
  });

  it("decreases as tick decreases", () => {
    expect(priceFromTick(-100)).toBeLessThan(priceFromTick(0));
  });
});
