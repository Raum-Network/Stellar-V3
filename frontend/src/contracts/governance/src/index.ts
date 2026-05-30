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
    contractId: "CA6BSIKXUSYVNBPYENS3EFBHLOXFO3TKNGOAFU45XIZPOM2DEDU5FKU2",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "ProposalCount", values: void} | {tag: "VotingToken", values: void} | {tag: "Proposal", values: readonly [u64]} | {tag: "Vote", values: readonly [u64, string]};


export interface Proposal {
  action: ProposalAction;
  against_votes: i128;
  desc: string;
  for_votes: i128;
  id: u64;
  proposer: string;
  status: ProposalStatus;
  title: string;
  vote_end: u64;
  vote_start: u64;
}


export interface VoteRecord {
  support: boolean;
  timestamp: u64;
}


export interface ProposalAction {
  args: Array<any>;
  contract: string;
  function: string;
}

export type ProposalStatus = {tag: "Active", values: void} | {tag: "Executed", values: void} | {tag: "Defeated", values: void};

export interface Client {
  /**
   * Construct and simulate a vote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  vote: ({voter, proposal_id, support}: {voter: string, proposal_id: u64, support: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a execute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute: ({proposal_id}: {proposal_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a propose transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose: ({proposer, title, desc, action_contract, action_function, action_args, voting_period}: {proposer: string, title: string, desc: string, action_contract: string, action_function: string, action_args: Array<any>, voting_period: u64}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, voting_token}: {admin: string, voting_token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_proposal transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_proposal: ({proposal_id}: {proposal_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Proposal>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAANUHJvcG9zYWxDb3VudAAAAAAAAAAAAAAAAAAAC1ZvdGluZ1Rva2VuAAAAAAEAAAAAAAAACFByb3Bvc2FsAAAAAQAAAAYAAAABAAAAAAAAAARWb3RlAAAAAgAAAAYAAAAT",
        "AAAAAAAAAAAAAAAEdm90ZQAAAAMAAAAAAAAABXZvdGVyAAAAAAAAEwAAAAAAAAALcHJvcG9zYWxfaWQAAAAABgAAAAAAAAAHc3VwcG9ydAAAAAABAAAAAA==",
        "AAAAAQAAAAAAAAAAAAAACFByb3Bvc2FsAAAACgAAAAAAAAAGYWN0aW9uAAAAAAfQAAAADlByb3Bvc2FsQWN0aW9uAAAAAAAAAAAADWFnYWluc3Rfdm90ZXMAAAAAAAALAAAAAAAAAARkZXNjAAAAEAAAAAAAAAAJZm9yX3ZvdGVzAAAAAAAACwAAAAAAAAACaWQAAAAAAAYAAAAAAAAACHByb3Bvc2VyAAAAEwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAADlByb3Bvc2FsU3RhdHVzAAAAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAIdm90ZV9lbmQAAAAGAAAAAAAAAAp2b3RlX3N0YXJ0AAAAAAAG",
        "AAAAAQAAAAAAAAAAAAAAClZvdGVSZWNvcmQAAAAAAAIAAAAAAAAAB3N1cHBvcnQAAAAAAQAAAAAAAAAJdGltZXN0YW1wAAAAAAAABg==",
        "AAAAAAAAAAAAAAAHZXhlY3V0ZQAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAAGAAAAAA==",
        "AAAAAAAAAAAAAAAHcHJvcG9zZQAAAAAHAAAAAAAAAAhwcm9wb3NlcgAAABMAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAEZGVzYwAAABAAAAAAAAAAD2FjdGlvbl9jb250cmFjdAAAAAATAAAAAAAAAA9hY3Rpb25fZnVuY3Rpb24AAAAAEQAAAAAAAAALYWN0aW9uX2FyZ3MAAAAD6gAAAAAAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAGAAAAAQAAAAY=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAx2b3RpbmdfdG9rZW4AAAATAAAAAA==",
        "AAAAAQAAAAAAAAAAAAAADlByb3Bvc2FsQWN0aW9uAAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAIZnVuY3Rpb24AAAAR",
        "AAAAAgAAAAAAAAAAAAAADlByb3Bvc2FsU3RhdHVzAAAAAAADAAAAAAAAAAAAAAAGQWN0aXZlAAAAAAAAAAAAAAAAAAhFeGVjdXRlZAAAAAAAAAAAAAAACERlZmVhdGVk",
        "AAAAAAAAAAAAAAAMZ2V0X3Byb3Bvc2FsAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAABgAAAAEAAAfQAAAACFByb3Bvc2Fs" ]),
      options
    )
  }
  public readonly fromJSON = {
    vote: this.txFromJSON<null>,
        execute: this.txFromJSON<null>,
        propose: this.txFromJSON<u64>,
        initialize: this.txFromJSON<null>,
        get_proposal: this.txFromJSON<Proposal>
  }
}