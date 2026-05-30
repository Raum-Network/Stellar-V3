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
    contractId: "CBXSK5BVCT6NGRCLXCUDUQCD44FV6K62KWFHDE5NELLIMXD5KS53RWWS",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "PendingAdminEta", values: void} | {tag: "FeeTiers", values: void} | {tag: "Pools", values: readonly [string, string, u32]} | {tag: "WasmHash", values: void} | {tag: "PositionManager", values: void} | {tag: "PermissionlessPoolCreation", values: void} | {tag: "Paused", values: void};


export interface FeeTier {
  fee: u32;
  tick_spacing: u32;
}

export interface Client {
  /**
   * Construct and simulate a get_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pool: ({token_a, token_b, fee}: {token_a: string, token_b: string, fee: u32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, wasm_hash, position_manager}: {admin: string, wasm_hash: Buffer, position_manager: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_paused: ({paused}: {paused: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a create_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_pool: ({token_a, token_b, fee, initial_tick}: {token_a: string, token_b: string, fee: u32, initial_tick: i32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a enable_fee_tier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  enable_fee_tier: ({fee, tick_spacing}: {fee: u32, tick_spacing: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_pool_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_pool_paused: ({pool, paused}: {pool: string, paused: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_position_manager transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_position_manager: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a accept_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin_transfer: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_admin_transfer: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_pool_protocol_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_pool_protocol_fee: ({pool, protocol_fee}: {pool: string, protocol_fee: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose_admin_transfer: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_pool_max_tick_crosses transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_pool_max_tick_crosses: ({pool, max_tick_crosses_per_swap}: {pool: string, max_tick_crosses_per_swap: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a collect_pool_protocol_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  collect_pool_protocol_fees: ({pool, recipient}: {pool: string, recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<readonly [u128, u128]>>

  /**
   * Construct and simulate a set_permissionless_pool_creation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_permissionless_pool_creation: ({enabled}: {enabled: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAAPUGVuZGluZ0FkbWluRXRhAAAAAAAAAAAAAAAACEZlZVRpZXJzAAAAAQAAAAAAAAAFUG9vbHMAAAAAAAADAAAAEwAAABMAAAAEAAAAAAAAAAAAAAAIV2FzbUhhc2gAAAAAAAAAAAAAAA9Qb3NpdGlvbk1hbmFnZXIAAAAAAAAAAAAAAAAaUGVybWlzc2lvbmxlc3NQb29sQ3JlYXRpb24AAAAAAAAAAAAAAAAABlBhdXNlZAAA",
        "AAAAAQAAAAAAAAAAAAAAB0ZlZVRpZXIAAAAAAgAAAAAAAAADZmVlAAAAAAQAAAAAAAAADHRpY2tfc3BhY2luZwAAAAQ=",
        "AAAAAAAAAAAAAAAIZ2V0X3Bvb2wAAAADAAAAAAAAAAd0b2tlbl9hAAAAABMAAAAAAAAAB3Rva2VuX2IAAAAAEwAAAAAAAAADZmVlAAAAAAQAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAQcG9zaXRpb25fbWFuYWdlcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAKc2V0X3BhdXNlZAAAAAAAAQAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAA==",
        "AAAAAAAAAAAAAAALY3JlYXRlX3Bvb2wAAAAABAAAAAAAAAAHdG9rZW5fYQAAAAATAAAAAAAAAAd0b2tlbl9iAAAAABMAAAAAAAAAA2ZlZQAAAAAEAAAAAAAAAAxpbml0aWFsX3RpY2sAAAAFAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAPZW5hYmxlX2ZlZV90aWVyAAAAAAIAAAAAAAAAA2ZlZQAAAAAEAAAAAAAAAAx0aWNrX3NwYWNpbmcAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAAPc2V0X3Bvb2xfcGF1c2VkAAAAAAIAAAAAAAAABHBvb2wAAAATAAAAAAAAAAZwYXVzZWQAAAAAAAEAAAAA",
        "AAAAAAAAAAAAAAAUZ2V0X3Bvc2l0aW9uX21hbmFnZXIAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAVYWNjZXB0X2FkbWluX3RyYW5zZmVyAAAAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAVY2FuY2VsX2FkbWluX3RyYW5zZmVyAAAAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAVc2V0X3Bvb2xfcHJvdG9jb2xfZmVlAAAAAAAAAgAAAAAAAAAEcG9vbAAAABMAAAAAAAAADHByb3RvY29sX2ZlZQAAAAQAAAAA",
        "AAAAAAAAAAAAAAAWcHJvcG9zZV9hZG1pbl90cmFuc2ZlcgAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAZc2V0X3Bvb2xfbWF4X3RpY2tfY3Jvc3NlcwAAAAAAAAIAAAAAAAAABHBvb2wAAAATAAAAAAAAABltYXhfdGlja19jcm9zc2VzX3Blcl9zd2FwAAAAAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAaY29sbGVjdF9wb29sX3Byb3RvY29sX2ZlZXMAAAAAAAIAAAAAAAAABHBvb2wAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAA+0AAAACAAAACgAAAAo=",
        "AAAAAAAAAAAAAAAgc2V0X3Blcm1pc3Npb25sZXNzX3Bvb2xfY3JlYXRpb24AAAABAAAAAAAAAAdlbmFibGVkAAAAAAEAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_pool: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        initialize: this.txFromJSON<null>,
        set_paused: this.txFromJSON<null>,
        create_pool: this.txFromJSON<string>,
        enable_fee_tier: this.txFromJSON<null>,
        set_pool_paused: this.txFromJSON<null>,
        get_position_manager: this.txFromJSON<string>,
        accept_admin_transfer: this.txFromJSON<null>,
        cancel_admin_transfer: this.txFromJSON<null>,
        set_pool_protocol_fee: this.txFromJSON<null>,
        propose_admin_transfer: this.txFromJSON<null>,
        set_pool_max_tick_crosses: this.txFromJSON<null>,
        collect_pool_protocol_fees: this.txFromJSON<readonly [u128, u128]>,
        set_permissionless_pool_creation: this.txFromJSON<null>
  }
}