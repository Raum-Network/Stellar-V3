use ethnum::u256;

const Q96: u256 = u256::new(79228162514264337593543950336); // 2^96

pub fn u256_to_tuple(v: u256) -> (u128, u128) {
    let low = v.as_u128();
    let high = (v >> 128u32).as_u128();
    (high, low)
}

pub fn tuple_to_u256(v: (u128, u128)) -> u256 {
    (u256::from(v.0) << 128) | u256::from(v.1)
}

/// Convert tick index to sqrt(price) in Q64.96 fixed-point format
/// Price at tick i is 1.0001^i
pub fn tick_to_sqrt_price_x96(tick: i32) -> u256 {
    // Full-range CLMM relies on accurate tick math near ±887k.
    // This mirrors Uniswap V3 TickMath with Q128.128 intermediates,
    // then rounds up when converting to Q64.96.
    const MIN_TICK: i32 = -887_272;
    const MAX_TICK: i32 = 887_272;
    if tick < MIN_TICK || tick > MAX_TICK {
        panic!("Tick out of bounds");
    }

    let abs_tick = if tick < 0 {
        (-tick) as u32
    } else {
        tick as u32
    };
    let mut ratio = if (abs_tick & 0x1) != 0 {
        u256::from(0xfffcb933bd6fad37aa2d162d1a594001u128)
    } else {
        u256::new(1) << 128
    };

    if (abs_tick & 0x2) != 0 {
        ratio = (ratio * u256::from(0xfff97272373d413259a46990580e213au128)) >> 128;
    }
    if (abs_tick & 0x4) != 0 {
        ratio = (ratio * u256::from(0xfff2e50f5f656932ef12357cf3c7fdccu128)) >> 128;
    }
    if (abs_tick & 0x8) != 0 {
        ratio = (ratio * u256::from(0xffe5caca7e10e4e61c3624eaa0941cd0u128)) >> 128;
    }
    if (abs_tick & 0x10) != 0 {
        ratio = (ratio * u256::from(0xffcb9843d60f6159c9db58835c926644u128)) >> 128;
    }
    if (abs_tick & 0x20) != 0 {
        ratio = (ratio * u256::from(0xff973b41fa98c081472e6896dfb254c0u128)) >> 128;
    }
    if (abs_tick & 0x40) != 0 {
        ratio = (ratio * u256::from(0xff2ea16466c96a3843ec78b326b52861u128)) >> 128;
    }
    if (abs_tick & 0x80) != 0 {
        ratio = (ratio * u256::from(0xfe5dee046a99a2a811c461f1969c3053u128)) >> 128;
    }
    if (abs_tick & 0x100) != 0 {
        ratio = (ratio * u256::from(0xfcbe86c7900a88aedcffc83b479aa3a4u128)) >> 128;
    }
    if (abs_tick & 0x200) != 0 {
        ratio = (ratio * u256::from(0xf987a7253ac413176f2b074cf7815e54u128)) >> 128;
    }
    if (abs_tick & 0x400) != 0 {
        ratio = (ratio * u256::from(0xf3392b0822b70005940c7a398e4b70f3u128)) >> 128;
    }
    if (abs_tick & 0x800) != 0 {
        ratio = (ratio * u256::from(0xe7159475a2c29b7443b29c7fa6e889d9u128)) >> 128;
    }
    if (abs_tick & 0x1000) != 0 {
        ratio = (ratio * u256::from(0xd097f3bdfd2022b8845ad8f792aa5825u128)) >> 128;
    }
    if (abs_tick & 0x2000) != 0 {
        ratio = (ratio * u256::from(0xa9f746462d870fdf8a65dc1f90e061e5u128)) >> 128;
    }
    if (abs_tick & 0x4000) != 0 {
        ratio = (ratio * u256::from(0x70d869a156d2a1b890bb3df62baf32f7u128)) >> 128;
    }
    if (abs_tick & 0x8000) != 0 {
        ratio = (ratio * u256::from(0x31be135f97d08fd981231505542fcfa6u128)) >> 128;
    }
    if (abs_tick & 0x10000) != 0 {
        ratio = (ratio * u256::from(0x09aa508b5b7a84e1c677de54f3e99bc9u128)) >> 128;
    }
    if (abs_tick & 0x20000) != 0 {
        ratio = (ratio * u256::from(0x005d6af8dedb81196699c329225ee604u128)) >> 128;
    }
    if (abs_tick & 0x40000) != 0 {
        ratio = (ratio * u256::from(0x0002216e584f5fa1ea926041bedfe98u128)) >> 128;
    }
    if (abs_tick & 0x80000) != 0 {
        ratio = (ratio * u256::from(0x000048a170391f7dc42444e8fa2u128)) >> 128;
    }

    if tick > 0 {
        ratio = u256::MAX / ratio;
    }

    let q32 = u256::new(1) << 32;
    let remainder_mask = q32 - u256::new(1);
    let mut sqrt_price_x96 = ratio >> 32;
    if (ratio & remainder_mask) != u256::new(0) {
        sqrt_price_x96 += u256::new(1);
    }
    sqrt_price_x96
}

pub fn calc_amount_from_liquidity(
    liquidity: u128,
    tick_lower: i32,
    tick_upper: i32,
    tick_current: i32,
) -> (u128, u128) {
    fn ceil_div(n: u256, d: u256) -> u256 {
        if n == u256::new(0) {
            u256::new(0)
        } else {
            ((n - u256::new(1)) / d) + u256::new(1)
        }
    }

    let sqrt_current = tick_to_sqrt_price_x96(tick_current);
    let sqrt_lower = tick_to_sqrt_price_x96(tick_lower);
    let sqrt_upper = tick_to_sqrt_price_x96(tick_upper);
    let q96 = u256::new(1) << 96;
    let liquidity_u256 = u256::from(liquidity);

    if tick_current <= tick_lower {
        // amount0 = ceil(L * (sqrt_upper - sqrt_lower) * Q96 / (sqrt_upper * sqrt_lower))
        // Rearranged to keep intermediates within u256 for wide/full ranges.
        let diff = sqrt_upper - sqrt_lower;
        let scaled = ceil_div(diff << 96, sqrt_upper);
        let amount0 = ceil_div(liquidity_u256 * scaled, sqrt_lower);
        return (amount0.as_u128(), 0);
    } else if tick_current >= tick_upper {
        // All in token1: L * (sqrt_upper - sqrt_lower)
        let product: u256 = liquidity_u256 * (sqrt_upper - sqrt_lower);
        let amount1: u256 = ceil_div(product, q96);
        return (0, amount1.as_u128());
    } else {
        // Split
        // amount0 = ceil(L * (sqrt_upper - sqrt_current) * Q96 / (sqrt_upper * sqrt_current))
        let diff0 = sqrt_upper - sqrt_current;
        let scaled0 = ceil_div(diff0 << 96, sqrt_upper);
        let amount0 = ceil_div(liquidity_u256 * scaled0, sqrt_current);

        // amount1 = ceil(L * (sqrt_current - sqrt_lower) / Q96)
        let product1: u256 = liquidity_u256 * (sqrt_current - sqrt_lower);
        let amount1: u256 = ceil_div(product1, q96);

        return (amount0.as_u128(), amount1.as_u128());
    }
}

pub fn compute_swap_step(
    sqrt_price_current: u256,
    sqrt_price_target: u256,
    liquidity: u128,
    amount_remaining: i128,
    zero_for_one: bool,
    fee: u32,
) -> (i128, i128, u256, i128) {
    fn ceil_div(n: u256, d: u256) -> u256 {
        if n == u256::new(0) {
            u256::new(0)
        } else {
            ((n - u256::new(1)) / d) + u256::new(1)
        }
    }

    if liquidity == 0 {
        return (0, 0, sqrt_price_current, 0);
    }

    let fee_denom = 1_000_000u128;
    let fee_pips = fee as u128;
    if fee_pips >= fee_denom {
        panic!("Invalid fee");
    }

    let liquidity_u256 = u256::from(liquidity);
    let exact_input = amount_remaining >= 0;
    let mut next_sqrt_price = sqrt_price_target;
    let mut amount_in_post_fee = u256::new(0);
    let mut amount_out_u256 = u256::new(0);
    let mut amount_in_total_u256 = u256::new(0);

    if exact_input {
        let amount_remaining_u256 = u256::from(amount_remaining as u128);
        let amount_remaining_less_fee =
            (amount_remaining_u256 * u256::from(fee_denom - fee_pips)) / u256::from(fee_denom);

        if zero_for_one {
            let num = (liquidity_u256 * (sqrt_price_current - sqrt_price_target)) << 96;
            let den = sqrt_price_current * sqrt_price_target;
            if den == u256::new(0) {
                return (0, 0, sqrt_price_current, 0);
            }
            let amount_in_max = ceil_div(num, den);

            if amount_remaining_less_fee >= amount_in_max {
                amount_in_post_fee = amount_in_max;
                amount_out_u256 = (liquidity_u256 * (sqrt_price_current - sqrt_price_target)) >> 96;
                next_sqrt_price = sqrt_price_target;
                amount_in_total_u256 = ceil_div(
                    amount_in_post_fee * u256::from(fee_denom),
                    u256::from(fee_denom - fee_pips),
                );
            } else {
                amount_in_post_fee = amount_remaining_less_fee;
                let numerator = (liquidity_u256 << 96) * sqrt_price_current;
                let denominator =
                    (liquidity_u256 << 96) + (amount_in_post_fee * sqrt_price_current);
                if denominator == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                next_sqrt_price = numerator / denominator;
                amount_out_u256 = (liquidity_u256 * (sqrt_price_current - next_sqrt_price)) >> 96;
                // Partial exact-input step consumes all remaining input by definition.
                amount_in_total_u256 = amount_remaining_u256;
            }
        } else {
            let amount_in_max = ceil_div(
                liquidity_u256 * (sqrt_price_target - sqrt_price_current),
                Q96,
            );

            if amount_remaining_less_fee >= amount_in_max {
                amount_in_post_fee = amount_in_max;
                let num = (liquidity_u256 * (sqrt_price_target - sqrt_price_current)) << 96;
                let den = sqrt_price_current * sqrt_price_target;
                if den == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                amount_out_u256 = num / den;
                next_sqrt_price = sqrt_price_target;
                amount_in_total_u256 = ceil_div(
                    amount_in_post_fee * u256::from(fee_denom),
                    u256::from(fee_denom - fee_pips),
                );
            } else {
                amount_in_post_fee = amount_remaining_less_fee;
                let delta = (amount_in_post_fee << 96) / liquidity_u256;
                next_sqrt_price = sqrt_price_current + delta;
                let num = (liquidity_u256 * (next_sqrt_price - sqrt_price_current)) << 96;
                let den = sqrt_price_current * next_sqrt_price;
                if den == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                amount_out_u256 = num / den;
                // Partial exact-input step consumes all remaining input by definition.
                amount_in_total_u256 = amount_remaining_u256;
            }
        }
    } else {
        let amount_out_remaining = u256::from((-amount_remaining) as u128);

        if zero_for_one {
            let amount_out_max = (liquidity_u256 * (sqrt_price_current - sqrt_price_target)) >> 96;

            if amount_out_remaining >= amount_out_max {
                amount_out_u256 = amount_out_max;
                next_sqrt_price = sqrt_price_target;
            } else {
                amount_out_u256 = amount_out_remaining;
                let delta = (amount_out_u256 << 96) / liquidity_u256;
                next_sqrt_price = sqrt_price_current - delta;
            }

            let num = (liquidity_u256 * (sqrt_price_current - next_sqrt_price)) << 96;
            let den = sqrt_price_current * next_sqrt_price;
            if den == u256::new(0) {
                return (0, 0, sqrt_price_current, 0);
            }
            amount_in_post_fee = ceil_div(num, den);
        } else {
            let num_out_max = (liquidity_u256 * (sqrt_price_target - sqrt_price_current)) << 96;
            let den_out_max = sqrt_price_current * sqrt_price_target;
            if den_out_max == u256::new(0) {
                return (0, 0, sqrt_price_current, 0);
            }
            let amount_out_max = num_out_max / den_out_max;

            if amount_out_remaining >= amount_out_max {
                amount_out_u256 = amount_out_max;
                next_sqrt_price = sqrt_price_target;
            } else {
                amount_out_u256 = amount_out_remaining;
                let lq96 = liquidity_u256 << 96;
                let denominator = lq96 - (amount_out_u256 * sqrt_price_current);
                if denominator == u256::new(0) {
                    return (0, 0, sqrt_price_current, 0);
                }
                next_sqrt_price = (lq96 * sqrt_price_current) / denominator;
            }

            amount_in_post_fee =
                ceil_div(liquidity_u256 * (next_sqrt_price - sqrt_price_current), Q96);
        }

        amount_in_total_u256 = ceil_div(
            amount_in_post_fee * u256::from(fee_denom),
            u256::from(fee_denom - fee_pips),
        );
    }

    let max_i128 = u256::from(i128::MAX as u128);
    if amount_in_total_u256 > max_i128 || amount_out_u256 > max_i128 {
        panic!("Swap amount overflow");
    }
    let fee_amount_u256 = amount_in_total_u256
        .checked_sub(amount_in_post_fee)
        .expect("Swap fee underflow");
    if fee_amount_u256 > max_i128 {
        panic!("Swap fee overflow");
    }

    (
        amount_in_total_u256.as_u128() as i128,
        amount_out_u256.as_u128() as i128,
        next_sqrt_price,
        fee_amount_u256.as_u128() as i128,
    )
}
