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
    contractId: "CC2PKJN76KR22WZCIDEN2LXOHJOTK4XA5QXWUE7OFMALFGY4RUUU5M2J",
  }
} as const

export type DataKey = {tag: "Pool", values: void} | {tag: "TickData", values: readonly [i32]} | {tag: "Observations", values: readonly [u32]} | {tag: "ObservationState", values: void} | {tag: "FeeGrowthGlobal0", values: void} | {tag: "FeeGrowthGlobal1", values: void} | {tag: "ProtocolFees", values: readonly [u32]};


export interface TickData {
  fee_growth_outside_0: readonly [u128, u128];
  fee_growth_outside_1: readonly [u128, u128];
  initialized: boolean;
  liquidity_cumulative_outside: u128;
  liquidity_gross: u128;
  liquidity_net: i128;
  tick_cumulative_outside: i64;
}


export interface PoolState {
  current_tick: i32;
  factory: string;
  fee: u32;
  fees_uncollected_0: u128;
  fees_uncollected_1: u128;
  liquidity: u128;
  position_manager: string;
  protocol_fee: u32;
  sqrt_price_x96: readonly [u128, u128];
  tick_spacing: u32;
  token0: string;
  token1: string;
}


export interface Observation {
  initialized: boolean;
  liquidity_cumulative: u128;
  tick_cumulative: i64;
  timestamp: u64;
}


export interface OracleConfig {
  cardinality: u32;
  cardinality_next: u32;
  index: u32;
}

export interface Client {
  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Legacy burn - kept for backward compatibility but no longer stores positions
   */
  burn: ({to, position_id, liquidity}: {to: string, position_id: u64, liquidity: u128}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128]>>

  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Legacy mint function - redirects to add_liquidity
   * DEPRECATED: Use PositionManager.mint() instead
   */
  mint: ({to, tick_lower, tick_upper, liquidity_desired}: {to: string, tick_lower: i32, tick_upper: i32, liquidity_desired: u128}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128, u64]>>

  /**
   * Construct and simulate a swap transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap: ({recipient, zero_for_one, amount_specified, sqrt_price_limit_x96_tuple}: {recipient: string, zero_for_one: boolean, amount_specified: i128, sqrt_price_limit_x96_tuple: readonly [u128, u128]}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a collect transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Legacy collect - kept for backward compatibility
   */
  collect: ({to, position_id}: {to: string, position_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128]>>

  /**
   * Construct and simulate a observe transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  observe: ({seconds_ago}: {seconds_ago: Array<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<Array<readonly [i64, u128]>>>

  /**
   * Construct and simulate a get_state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get pool state (useful for frontend queries)
   */
  get_state: (options?: MethodOptions) => Promise<AssembledTransaction<PoolState>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({factory, token0, token1, fee, tick_spacing, initial_tick, position_manager}: {factory: string, token0: string, token1: string, fee: u32, tick_spacing: u32, initial_tick: i32, position_manager: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a collect_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Collect accumulated fees (called by PositionManager NFT contract)
   */
  collect_fees: ({recipient, tick_lower, tick_upper}: {recipient: string, tick_lower: i32, tick_upper: i32}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128]>>

  /**
   * Construct and simulate a add_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add liquidity to the pool (called by PositionManager NFT contract)
   * Returns (amount0, amount1) transferred
   */
  add_liquidity: ({provider, tick_lower, tick_upper, liquidity}: {provider: string, tick_lower: i32, tick_upper: i32, liquidity: u128}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128]>>

  /**
   * Construct and simulate a remove_liquidity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Remove liquidity from the pool (called by PositionManager NFT contract)
   * Returns (amount0, amount1) to be transferred to user
   */
  remove_liquidity: ({recipient, tick_lower, tick_upper, liquidity}: {recipient: string, tick_lower: i32, tick_upper: i32, liquidity: u128}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128]>>

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
      new ContractSpec([ "AAAAAAAAAExMZWdhY3kgYnVybiAtIGtlcHQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgYnV0IG5vIGxvbmdlciBzdG9yZXMgcG9zaXRpb25zAAAABGJ1cm4AAAADAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAALcG9zaXRpb25faWQAAAAABgAAAAAAAAAJbGlxdWlkaXR5AAAAAAAACgAAAAEAAAPtAAAAAgAAAAoAAAAK",
        "AAAAAAAAAGBMZWdhY3kgbWludCBmdW5jdGlvbiAtIHJlZGlyZWN0cyB0byBhZGRfbGlxdWlkaXR5CkRFUFJFQ0FURUQ6IFVzZSBQb3NpdGlvbk1hbmFnZXIubWludCgpIGluc3RlYWQAAAAEbWludAAAAAQAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAp0aWNrX2xvd2VyAAAAAAAFAAAAAAAAAAp0aWNrX3VwcGVyAAAAAAAFAAAAAAAAABFsaXF1aWRpdHlfZGVzaXJlZAAAAAAAAAoAAAABAAAD7QAAAAMAAAAKAAAACgAAAAY=",
        "AAAAAAAAAAAAAAAEc3dhcAAAAAQAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAADHplcm9fZm9yX29uZQAAAAEAAAAAAAAAEGFtb3VudF9zcGVjaWZpZWQAAAALAAAAAAAAABpzcXJ0X3ByaWNlX2xpbWl0X3g5Nl90dXBsZQAAAAAD7QAAAAIAAAAKAAAACgAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAADBMZWdhY3kgY29sbGVjdCAtIGtlcHQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkAAAAHY29sbGVjdAAAAAACAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAALcG9zaXRpb25faWQAAAAABgAAAAEAAAPtAAAAAgAAAAoAAAAK",
        "AAAAAAAAAAAAAAAHb2JzZXJ2ZQAAAAABAAAAAAAAAAtzZWNvbmRzX2FnbwAAAAPqAAAABAAAAAEAAAPqAAAD7QAAAAIAAAAHAAAACg==",
        "AAAAAAAAACxHZXQgcG9vbCBzdGF0ZSAodXNlZnVsIGZvciBmcm9udGVuZCBxdWVyaWVzKQAAAAlnZXRfc3RhdGUAAAAAAAAAAAAAAQAAB9AAAAAJUG9vbFN0YXRlAAAA",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABwAAAAAAAAAHZmFjdG9yeQAAAAATAAAAAAAAAAZ0b2tlbjAAAAAAABMAAAAAAAAABnRva2VuMQAAAAAAEwAAAAAAAAADZmVlAAAAAAQAAAAAAAAADHRpY2tfc3BhY2luZwAAAAQAAAAAAAAADGluaXRpYWxfdGljawAAAAUAAAAAAAAAEHBvc2l0aW9uX21hbmFnZXIAAAATAAAAAA==",
        "AAAAAAAAAEFDb2xsZWN0IGFjY3VtdWxhdGVkIGZlZXMgKGNhbGxlZCBieSBQb3NpdGlvbk1hbmFnZXIgTkZUIGNvbnRyYWN0KQAAAAAAAAxjb2xsZWN0X2ZlZXMAAAADAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAp0aWNrX2xvd2VyAAAAAAAFAAAAAAAAAAp0aWNrX3VwcGVyAAAAAAAFAAAAAQAAA+0AAAACAAAACgAAAAo=",
        "AAAAAAAAAGlBZGQgbGlxdWlkaXR5IHRvIHRoZSBwb29sIChjYWxsZWQgYnkgUG9zaXRpb25NYW5hZ2VyIE5GVCBjb250cmFjdCkKUmV0dXJucyAoYW1vdW50MCwgYW1vdW50MSkgdHJhbnNmZXJyZWQAAAAAAAANYWRkX2xpcXVpZGl0eQAAAAAAAAQAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAKdGlja19sb3dlcgAAAAAABQAAAAAAAAAKdGlja191cHBlcgAAAAAABQAAAAAAAAAJbGlxdWlkaXR5AAAAAAAACgAAAAEAAAPtAAAAAgAAAAoAAAAK",
        "AAAAAAAAAHxSZW1vdmUgbGlxdWlkaXR5IGZyb20gdGhlIHBvb2wgKGNhbGxlZCBieSBQb3NpdGlvbk1hbmFnZXIgTkZUIGNvbnRyYWN0KQpSZXR1cm5zIChhbW91bnQwLCBhbW91bnQxKSB0byBiZSB0cmFuc2ZlcnJlZCB0byB1c2VyAAAAEHJlbW92ZV9saXF1aWRpdHkAAAAEAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAp0aWNrX2xvd2VyAAAAAAAFAAAAAAAAAAp0aWNrX3VwcGVyAAAAAAAFAAAAAAAAAAlsaXF1aWRpdHkAAAAAAAAKAAAAAQAAA+0AAAACAAAACgAAAAo=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABFBvb2wAAAABAAAAAAAAAAhUaWNrRGF0YQAAAAEAAAAFAAAAAQAAAAAAAAAMT2JzZXJ2YXRpb25zAAAAAQAAAAQAAAAAAAAAAAAAABBPYnNlcnZhdGlvblN0YXRlAAAAAAAAAAAAAAAQRmVlR3Jvd3RoR2xvYmFsMAAAAAAAAAAAAAAAEEZlZUdyb3d0aEdsb2JhbDEAAAABAAAAAAAAAAxQcm90b2NvbEZlZXMAAAABAAAABA==",
        "AAAAAQAAAAAAAAAAAAAACFRpY2tEYXRhAAAABwAAAAAAAAAUZmVlX2dyb3d0aF9vdXRzaWRlXzAAAAPtAAAAAgAAAAoAAAAKAAAAAAAAABRmZWVfZ3Jvd3RoX291dHNpZGVfMQAAA+0AAAACAAAACgAAAAoAAAAAAAAAC2luaXRpYWxpemVkAAAAAAEAAAAAAAAAHGxpcXVpZGl0eV9jdW11bGF0aXZlX291dHNpZGUAAAAKAAAAAAAAAA9saXF1aWRpdHlfZ3Jvc3MAAAAACgAAAAAAAAANbGlxdWlkaXR5X25ldAAAAAAAAAsAAAAAAAAAF3RpY2tfY3VtdWxhdGl2ZV9vdXRzaWRlAAAAAAc=",
        "AAAAAQAAAAAAAAAAAAAACVBvb2xTdGF0ZQAAAAAAAAwAAAAAAAAADGN1cnJlbnRfdGljawAAAAUAAAAAAAAAB2ZhY3RvcnkAAAAAEwAAAAAAAAADZmVlAAAAAAQAAAAAAAAAEmZlZXNfdW5jb2xsZWN0ZWRfMAAAAAAACgAAAAAAAAASZmVlc191bmNvbGxlY3RlZF8xAAAAAAAKAAAAAAAAAAlsaXF1aWRpdHkAAAAAAAAKAAAAAAAAABBwb3NpdGlvbl9tYW5hZ2VyAAAAEwAAAAAAAAAMcHJvdG9jb2xfZmVlAAAABAAAAAAAAAAOc3FydF9wcmljZV94OTYAAAAAA+0AAAACAAAACgAAAAoAAAAAAAAADHRpY2tfc3BhY2luZwAAAAQAAAAAAAAABnRva2VuMAAAAAAAEwAAAAAAAAAGdG9rZW4xAAAAAAAT",
        "AAAAAQAAAAAAAAAAAAAAC09ic2VydmF0aW9uAAAAAAQAAAAAAAAAC2luaXRpYWxpemVkAAAAAAEAAAAAAAAAFGxpcXVpZGl0eV9jdW11bGF0aXZlAAAACgAAAAAAAAAPdGlja19jdW11bGF0aXZlAAAAAAcAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAY=",
        "AAAAAQAAAAAAAAAAAAAADE9yYWNsZUNvbmZpZwAAAAMAAAAAAAAAC2NhcmRpbmFsaXR5AAAAAAQAAAAAAAAAEGNhcmRpbmFsaXR5X25leHQAAAAEAAAAAAAAAAVpbmRleAAAAAAAAAQ=" ]),
      options
    )
  }
  public readonly fromJSON = {
    burn: this.txFromJSON<readonly [u128, u128]>,
        mint: this.txFromJSON<readonly [u128, u128, u64]>,
        swap: this.txFromJSON<readonly [i128, i128]>,
        collect: this.txFromJSON<readonly [u128, u128]>,
        observe: this.txFromJSON<Array<readonly [i64, u128]>>,
        get_state: this.txFromJSON<PoolState>,
        initialize: this.txFromJSON<null>,
        collect_fees: this.txFromJSON<readonly [u128, u128]>,
        add_liquidity: this.txFromJSON<readonly [u128, u128]>,
        remove_liquidity: this.txFromJSON<readonly [u128, u128]>
  }
}