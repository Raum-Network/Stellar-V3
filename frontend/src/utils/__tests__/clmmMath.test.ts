import { describe, expect, it } from "vitest";
import {
  calcAmountsFromLiquidity,
  maxLiquidityForDesiredAmounts,
  tickToSqrtPriceX96,
} from "@/utils/clmmMath";

describe("clmmMath", () => {
  it("matches Q96 at tick 0", () => {
    expect(tickToSqrtPriceX96(0)).toBe(BigInt(1) << BigInt(96));
  });

  it("matches observed on-chain amounts for the reported mint transaction", () => {
    const { amount0, amount1 } = calcAmountsFromLiquidity(
      BigInt(10_000_000),
      -19_980,
      -16_860,
      18_300
    );
    expect(amount0).toBe(BigInt(0));
    expect(amount1).toBe(BigInt(621_696));
  });

  it("derives liquidity capped by desired token amount", () => {
    const liquidity = maxLiquidityForDesiredAmounts(
      BigInt(0),
      BigInt(621_696),
      -19_980,
      -16_860,
      18_300
    );
    const atLiquidity = calcAmountsFromLiquidity(liquidity, -19_980, -16_860, 18_300);
    const atNext = calcAmountsFromLiquidity(liquidity + BigInt(1), -19_980, -16_860, 18_300);
    expect(atLiquidity.amount0).toBeLessThanOrEqual(BigInt(0));
    expect(atLiquidity.amount1).toBeLessThanOrEqual(BigInt(621_696));
    expect(atNext.amount0 > BigInt(0) || atNext.amount1 > BigInt(621_696)).toBe(true);
  });
});
