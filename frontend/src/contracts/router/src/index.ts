import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBHWSUDOTZSMSFXA2KGCME64DXP2VYSOOARGTUXNUQJTFPLEV3GCDMFV",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "Factory", values: void} | {tag: "Xlm", values: void};


export interface PoolState {
  current_tick: i32;
  factory: string;
  fee: u32;
  fees_uncollected_0: u128;
  fees_uncollected_1: u128;
  liquidity: u128;
  max_tick_crosses_per_swap: u32;
  paused: boolean;
  position_manager: string;
  protocol_fee: u32;
  protocol_fees_0: u128;
  protocol_fees_1: u128;
  sqrt_price_x96: readonly [u128, u128];
  tick_spacing: u32;
  token0: string;
  token1: string;
}


export interface PathElement {
  fee: u32;
  token_in: string;
  token_out: string;
}

export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, factory, xlm}: {admin: string, factory: string, xlm: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a add_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  add_liquidity: ({token_a, token_b, fee, tick_lower, tick_upper, liquidity, to}: {token_a: string, token_b: string, fee: u32, tick_lower: i32, tick_upper: i32, liquidity: u128, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128, u64]>>

  /**
   * Construct and simulate a swap_exact_input transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Exact Input Swap
   * Executes a swap where the input amount is fixed, and the output amount is calculated.
   */
  swap_exact_input: ({path, amount_in, amount_out_minimum, payer, recipient, deadline, sqrt_price_limit_x96}: {path: Array<PathElement>, amount_in: i128, amount_out_minimum: i128, payer: string, recipient: string, deadline: u64, sqrt_price_limit_x96: readonly [u128, u128]}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a swap_exact_output transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Exact Output Swap
   * Executes a swap where the output amount is fixed, and the input amount is calculated.
   */
  swap_exact_output: ({path, amount_out, amount_in_maximum, payer, recipient, deadline, sqrt_price_limit_x96}: {path: Array<PathElement>, amount_out: i128, amount_in_maximum: i128, payer: string, recipient: string, deadline: u64, sqrt_price_limit_x96: readonly [u128, u128]}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "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" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<null>,
        add_liquidity: this.txFromJSON<readonly [u128, u128, u64]>,
        swap_exact_input: this.txFromJSON<i128>,
        swap_exact_output: this.txFromJSON<i128>
  }
}