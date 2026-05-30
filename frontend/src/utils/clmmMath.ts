const BI_ZERO = BigInt(0);
const BI_ONE = BigInt(1);
const BI_TWO = BigInt(2);
const SHIFT_32 = BigInt(32);
const SHIFT_96 = BigInt(96);
const SHIFT_128 = BigInt(128);
const SHIFT_256 = BigInt(256);

const MIN_TICK = -887_272;
const MAX_TICK = 887_272;
const Q96 = BI_ONE << SHIFT_96;
const Q32 = BI_ONE << SHIFT_32;
const U256_MAX = (BI_ONE << SHIFT_256) - BI_ONE;
const MAX_U128 = (BI_ONE << SHIFT_128) - BI_ONE;

const HEX = (value: string): bigint => BigInt(value);

const ensureU128 = (value: bigint): bigint => {
  if (value < BI_ZERO || value > MAX_U128) {
    throw new Error("Value does not fit in u128");
  }
  return value;
};

const ceilDiv = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator <= BI_ZERO) {
    throw new Error("Division by zero");
  }
  if (numerator === BI_ZERO) {
    return BI_ZERO;
  }
  return ((numerator - BI_ONE) / denominator) + BI_ONE;
};

const assertTickBounds = (tick: number): void => {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`Tick out of bounds: ${tick}`);
  }
};

export const tickToSqrtPriceX96 = (tick: number): bigint => {
  assertTickBounds(tick);

  const absTick = tick < 0 ? -tick : tick;
  let ratio =
    (absTick & 0x1) !== 0
      ? HEX("0xfffcb933bd6fad37aa2d162d1a594001")
      : BI_ONE << SHIFT_128;

  if ((absTick & 0x2) !== 0) ratio = (ratio * HEX("0xfff97272373d413259a46990580e213a")) >> SHIFT_128;
  if ((absTick & 0x4) !== 0) ratio = (ratio * HEX("0xfff2e50f5f656932ef12357cf3c7fdcc")) >> SHIFT_128;
  if ((absTick & 0x8) !== 0) ratio = (ratio * HEX("0xffe5caca7e10e4e61c3624eaa0941cd0")) >> SHIFT_128;
  if ((absTick & 0x10) !== 0) ratio = (ratio * HEX("0xffcb9843d60f6159c9db58835c926644")) >> SHIFT_128;
  if ((absTick & 0x20) !== 0) ratio = (ratio * HEX("0xff973b41fa98c081472e6896dfb254c0")) >> SHIFT_128;
  if ((absTick & 0x40) !== 0) ratio = (ratio * HEX("0xff2ea16466c96a3843ec78b326b52861")) >> SHIFT_128;
  if ((absTick & 0x80) !== 0) ratio = (ratio * HEX("0xfe5dee046a99a2a811c461f1969c3053")) >> SHIFT_128;
  if ((absTick & 0x100) !== 0) ratio = (ratio * HEX("0xfcbe86c7900a88aedcffc83b479aa3a4")) >> SHIFT_128;
  if ((absTick & 0x200) !== 0) ratio = (ratio * HEX("0xf987a7253ac413176f2b074cf7815e54")) >> SHIFT_128;
  if ((absTick & 0x400) !== 0) ratio = (ratio * HEX("0xf3392b0822b70005940c7a398e4b70f3")) >> SHIFT_128;
  if ((absTick & 0x800) !== 0) ratio = (ratio * HEX("0xe7159475a2c29b7443b29c7fa6e889d9")) >> SHIFT_128;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * HEX("0xd097f3bdfd2022b8845ad8f792aa5825")) >> SHIFT_128;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * HEX("0xa9f746462d870fdf8a65dc1f90e061e5")) >> SHIFT_128;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * HEX("0x70d869a156d2a1b890bb3df62baf32f7")) >> SHIFT_128;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * HEX("0x31be135f97d08fd981231505542fcfa6")) >> SHIFT_128;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * HEX("0x09aa508b5b7a84e1c677de54f3e99bc9")) >> SHIFT_128;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * HEX("0x005d6af8dedb81196699c329225ee604")) >> SHIFT_128;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * HEX("0x0002216e584f5fa1ea926041bedfe98")) >> SHIFT_128;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * HEX("0x000048a170391f7dc42444e8fa2")) >> SHIFT_128;

  if (tick > 0) {
    ratio = U256_MAX / ratio;
  }

  let sqrtPriceX96 = ratio >> SHIFT_32;
  if ((ratio & (Q32 - BI_ONE)) !== BI_ZERO) {
    sqrtPriceX96 += BI_ONE;
  }
  return sqrtPriceX96;
};

type SqrtInputs = {
  sqrtCurrent: bigint;
  sqrtLower: bigint;
  sqrtUpper: bigint;
  tickLower: number;
  tickUpper: number;
  tickCurrent: number;
};

const calcAmountsWithSqrt = (
  liquidity: bigint,
  inputs: SqrtInputs
): { amount0: bigint; amount1: bigint } => {
  if (liquidity <= BI_ZERO) {
    return { amount0: BI_ZERO, amount1: BI_ZERO };
  }

  const { sqrtCurrent, sqrtLower, sqrtUpper, tickLower, tickUpper, tickCurrent } = inputs;

  if (tickCurrent <= tickLower) {
    const diff = sqrtUpper - sqrtLower;
    const scaled = ceilDiv(diff << SHIFT_96, sqrtUpper);
    const amount0 = ceilDiv(liquidity * scaled, sqrtLower);
    return { amount0: ensureU128(amount0), amount1: BI_ZERO };
  }

  if (tickCurrent >= tickUpper) {
    const amount1 = ceilDiv(liquidity * (sqrtUpper - sqrtLower), Q96);
    return { amount0: BI_ZERO, amount1: ensureU128(amount1) };
  }

  const diff0 = sqrtUpper - sqrtCurrent;
  const scaled0 = ceilDiv(diff0 << SHIFT_96, sqrtUpper);
  const amount0 = ceilDiv(liquidity * scaled0, sqrtCurrent);
  const amount1 = ceilDiv(liquidity * (sqrtCurrent - sqrtLower), Q96);

  return {
    amount0: ensureU128(amount0),
    amount1: ensureU128(amount1),
  };
};

export const calcAmountsFromLiquidity = (
  liquidity: bigint,
  tickLower: number,
  tickUpper: number,
  tickCurrent: number
): { amount0: bigint; amount1: bigint } => {
  if (!Number.isInteger(tickLower) || !Number.isInteger(tickUpper) || !Number.isInteger(tickCurrent)) {
    throw new Error("Tick values must be integers");
  }
  if (tickLower >= tickUpper) {
    throw new Error("Invalid tick range");
  }

  const inputs: SqrtInputs = {
    sqrtCurrent: tickToSqrtPriceX96(tickCurrent),
    sqrtLower: tickToSqrtPriceX96(tickLower),
    sqrtUpper: tickToSqrtPriceX96(tickUpper),
    tickLower,
    tickUpper,
    tickCurrent,
  };

  return calcAmountsWithSqrt(liquidity, inputs);
};

export const maxLiquidityForDesiredAmounts = (
  desiredAmount0: bigint,
  desiredAmount1: bigint,
  tickLower: number,
  tickUpper: number,
  tickCurrent: number
): bigint => {
  if (desiredAmount0 < BI_ZERO || desiredAmount1 < BI_ZERO) {
    throw new Error("Desired amounts must be non-negative");
  }
  if (desiredAmount0 === BI_ZERO && desiredAmount1 === BI_ZERO) {
    return BI_ZERO;
  }
  if (!Number.isInteger(tickLower) || !Number.isInteger(tickUpper) || !Number.isInteger(tickCurrent)) {
    throw new Error("Tick values must be integers");
  }
  if (tickLower >= tickUpper) {
    throw new Error("Invalid tick range");
  }

  const inputs: SqrtInputs = {
    sqrtCurrent: tickToSqrtPriceX96(tickCurrent),
    sqrtLower: tickToSqrtPriceX96(tickLower),
    sqrtUpper: tickToSqrtPriceX96(tickUpper),
    tickLower,
    tickUpper,
    tickCurrent,
  };

  const exceedsDesired = (liquidity: bigint): boolean => {
    const { amount0, amount1 } = calcAmountsWithSqrt(liquidity, inputs);
    return amount0 > desiredAmount0 || amount1 > desiredAmount1;
  };

  let low = BI_ZERO;
  let high = BI_ONE;

  if (!exceedsDesired(high)) {
    while (high < MAX_U128) {
      const nextHigh = high > MAX_U128 / BI_TWO ? MAX_U128 : high * BI_TWO;
      if (nextHigh === high) {
        break;
      }
      high = nextHigh;
      if (exceedsDesired(high)) {
        break;
      }
    }

    if (!exceedsDesired(high)) {
      return high;
    }
  }

  while (low + BI_ONE < high) {
    const mid = (low + high) / BI_TWO;
    if (exceedsDesired(mid)) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return low;
};

export const parseTokenAmountToStroops = (value: string, decimals = 7): bigint | null => {
  const trimmed = value.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null;

  const [rawInt, rawFrac = ""] = trimmed.split(".");
  if (rawFrac.length > decimals) return null;
  if (rawInt === "" && rawFrac === "") return null;

  const intPart = rawInt === "" ? "0" : rawInt;
  const fracPart = rawFrac.padEnd(decimals, "0");
  const base = BigInt(`1${"0".repeat(decimals)}`);
  return BigInt(intPart) * base + BigInt(fracPart);
};

export const formatStroopsToToken = (amount: bigint, decimals = 7): string => {
  const negative = amount < BI_ZERO;
  const abs = negative ? -amount : amount;
  const base = BigInt(`1${"0".repeat(decimals)}`);
  const whole = abs / base;
  const fractionRaw = (abs % base).toString().padStart(decimals, "0");
  const fraction = fractionRaw.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
};
