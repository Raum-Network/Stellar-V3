"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  requestAccess,
  getAddress as getFreighterAddress,
  signTransaction as freighterSignTransaction,
  signAuthEntry as freighterSignAuthEntry,
  isConnected as isFreighterConnected,
} from "@stellar/freighter-api";
import { CONTRACT_IDS, RPC_URL, NETWORK_PASSPHRASE } from "@/contracts/config";
import {
  Contract,
  Address,
  rpc,
  scValToNative,
  TransactionBuilder,
  Account,
  xdr,
  Networks,
  Transaction,
} from "@stellar/stellar-sdk";

let Governance: typeof import("governance") | null = null;
let Factory: typeof import("factory") | null = null;
let Router: typeof import("router") | null = null;
let PositionManager: typeof import("position_manager") | null = null;

export interface PoolState {
  liquidity: bigint;
  currentTick: number;
  sqrtPriceX96: bigint;
  token0: string;
  token1: string;
  fee: number;
  feesUncollected0: bigint;
  feesUncollected1: bigint;
  protocolFee: number;
  tickSpacing: number;
  positionManager: string;
}

interface QuoteExactInputParams {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  fee: number;
  amountIn: bigint;
  sqrtPriceLimitX96?: readonly [bigint, bigint];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContractClient = any;

interface StellarContextType {
  address: string | null;
  walletType: "freighter" | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  governance: ContractClient | null;
  factory: ContractClient | null;
  router: ContractClient | null;
  positionManager: ContractClient | null;
  getTokenBalance: (tokenAddress: string, userAddress: string) => Promise<string>;
  mintToken: (tokenAddress: string, amount: string) => Promise<void>;
  getPoolState: (poolAddress: string) => Promise<PoolState | null>;
  quoteExactInput?: (params: QuoteExactInputParams) => Promise<bigint | null>;
  approveToken: (tokenAddress: string, spender: string, amount: bigint) => Promise<void>;
  checkAllowance: (tokenAddress: string, owner: string, spender: string) => Promise<bigint>;
  latestLedger: number | null;
  latestLedgerHash: string | null;
}

const StellarContext = createContext<StellarContextType | undefined>(undefined);

export const useStellar = () => {
  const context = useContext(StellarContext);
  if (!context) throw new Error("useStellar must be used within StellarProvider");
  return context;
};

const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const toI128 = (value: bigint): xdr.ScVal => {
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      hi: xdr.Int64.fromString((value >> BigInt(64)).toString()),
      lo: xdr.Uint64.fromString((value & ((BigInt(1) << BigInt(64)) - BigInt(1))).toString()),
    })
  );
};

const toU128 = (value: bigint): xdr.ScVal => {
  if (value < BigInt(0)) {
    throw new Error("u128 cannot be negative");
  }

  return xdr.ScVal.scvU128(
    new xdr.UInt128Parts({
      hi: xdr.Uint64.fromString((value >> BigInt(64)).toString()),
      lo: xdr.Uint64.fromString((value & ((BigInt(1) << BigInt(64)) - BigInt(1))).toString()),
    })
  );
};

const toFreighterErrorMessage = (error: unknown): string => {
  if (!error) return "Unknown Freighter error";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return JSON.stringify(error);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const StellarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<"freighter" | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const [clients, setClients] = useState<{
    governance: ContractClient | null;
    factory: ContractClient | null;
    router: ContractClient | null;
    positionManager: ContractClient | null;
  }>({
    governance: null,
    factory: null,
    router: null,
    positionManager: null,
  });
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const [latestLedgerHash, setLatestLedgerHash] = useState<string | null>(null);
  const rpcServer = React.useMemo(() => new rpc.Server(RPC_URL), []);

  useEffect(() => {
    if (typeof window !== "undefined" && !modulesLoaded) {
      Promise.all([import("governance"), import("factory"), import("router"), import("position_manager")]).then(
        ([gov, fac, rout, pos]) => {
          Governance = gov;
          Factory = fac;
          Router = rout;
          PositionManager = pos;
          setModulesLoaded(true);
        }
      );
    }
  }, [modulesLoaded]);

  const submitSignedTransaction = useCallback(async (signedTxXdr: string) => {
    const tx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE) as Transaction;
    const result = await rpcServer.sendTransaction(tx);
    if (result.status === "ERROR") {
      throw new Error(`Sending the transaction to the network failed!\n${JSON.stringify(result, null, 2)}`);
    }
    return result;
  }, [rpcServer]);

  const signTransaction = useCallback(
    async (
      txXdr: string,
      opts?: { networkPassphrase?: string; address?: string }
    ): Promise<{ signedTxXdr: string; signerAddress?: string }> => {
      if (!address) throw new Error("Wallet not connected");

      const result = await freighterSignTransaction(txXdr, {
        networkPassphrase: opts?.networkPassphrase || NETWORK_PASSPHRASE,
        address: opts?.address || address,
      });

      if (result.error || !result.signedTxXdr) {
        throw new Error(result.error ? toFreighterErrorMessage(result.error) : "Failed to sign transaction in Freighter");
      }

      return {
        signedTxXdr: result.signedTxXdr,
        signerAddress: result.signerAddress || address,
      };
    },
    [address]
  );

  const signAuthEntry = useCallback(
    async (entryXdr: string): Promise<{ signedAuthEntry: string; signerAddress?: string }> => {
      if (!address) throw new Error("Wallet not connected");

      const result = await freighterSignAuthEntry(entryXdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });

      if (result.error || !result.signedAuthEntry) {
        throw new Error(result.error ? toFreighterErrorMessage(result.error) : "Failed to sign auth entry in Freighter");
      }

      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress || address,
      };
    },
    [address]
  );

  const initClients = useCallback(
    (userAddress: string | null) => {
      if (!Governance || !Factory || !Router || !PositionManager) return;

      const commonOptions = {
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        allowHttp: true,
        publicKey: userAddress || undefined,
        signTransaction: userAddress ? signTransaction : undefined,
        signAuthEntry: userAddress ? signAuthEntry : undefined,
      };

      setClients({
        governance: new Governance.Client({ ...commonOptions, contractId: CONTRACT_IDS.governance }),
        factory: new Factory.Client({ ...commonOptions, contractId: CONTRACT_IDS.factory }),
        router: new Router.Client({ ...commonOptions, contractId: CONTRACT_IDS.router }),
        positionManager: new PositionManager.Client({ ...commonOptions, contractId: CONTRACT_IDS.position_manager }),
      });
    },
    [signAuthEntry, signTransaction]
  );

  useEffect(() => {
    if (!modulesLoaded) return;
    initClients(address);
  }, [address, initClients, modulesLoaded]);

  useEffect(() => {
    let cancelled = false;

    const hydrateExistingConnection = async () => {
      try {
        const connectedResult = await isFreighterConnected();
        if (connectedResult.error || !connectedResult.isConnected) {
          return;
        }

        const addressResult = await getFreighterAddress();
        if (addressResult.error || !addressResult.address) {
          return;
        }

        if (!cancelled) {
          setAddress(addressResult.address);
          setWalletType("freighter");
        }
      } catch (error) {
        console.error("Failed to restore Freighter connection", error);
      }
    };

    void hydrateExistingConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        const ledgerResponse = await rpcServer.getLatestLedger();
        setLatestLedger(ledgerResponse.sequence);
        setLatestLedgerHash(ledgerResponse.id);
      } catch (e) {
        console.error("Failed to fetch latest ledger", e);
      }
    };

    void fetchLedger();
    const interval = setInterval(fetchLedger, 5000);
    return () => clearInterval(interval);
  }, [rpcServer]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const response = await requestAccess();
      if (response.error || !response.address) {
        throw new Error(response.error ? toFreighterErrorMessage(response.error) : "Freighter connection failed");
      }

      setAddress(response.address);
      setWalletType("freighter");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setAddress(null);
    setWalletType(null);
  }, []);

  const getTokenBalance = useCallback(
    async (tokenAddress: string, userAddress: string) => {
      try {
        const contract = new Contract(tokenAddress);

        const source = address && address.startsWith("G") ? address : NULL_ACCOUNT;
        const balanceOp = contract.call("balance", new Address(userAddress).toScVal());

        const tx = new TransactionBuilder(new Account(source, "0"), {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(balanceOp)
          .setTimeout(0)
          .build();

        const sim = await rpcServer.simulateTransaction(tx);

        if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
          return scValToNative(sim.result.retval).toString();
        }
        return "0";
      } catch (e) {
        console.error("Failed to get balance", e);
        return "0";
      }
    },
    [address, rpcServer]
  );

  const mintToken = useCallback(
    async (tokenAddress: string, amount: string) => {
      if (!address) throw new Error("Wallet not connected");

      const contract = new Contract(tokenAddress);
      const account = await rpcServer.getAccount(address);
      const bigAmount = BigInt(amount);

      const op = contract.call("mint", new Address(address).toScVal(), toI128(bigAmount));

      const tx = new TransactionBuilder(account, {
        fee: "1000",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(op)
        .setTimeout(0)
        .build();

      const { signedTxXdr } = await signTransaction(tx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });
      await submitSignedTransaction(signedTxXdr);
    },
    [address, rpcServer, signTransaction, submitSignedTransaction]
  );

  const getPoolState = useCallback(
    async (poolAddress: string): Promise<PoolState | null> => {
      try {
        const contract = new Contract(poolAddress);
        const source = address || NULL_ACCOUNT;

        const op = contract.call("get_state");
        const tx = new TransactionBuilder(new Account(source, "0"), {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(op)
          .setTimeout(0)
          .build();

        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
          const native = scValToNative(sim.result.retval) as Record<string, unknown>;
          const toBigInt = (value: unknown) => {
            if (typeof value === "bigint") return value;
            if (typeof value === "number") return BigInt(Math.floor(value));
            if (typeof value === "string") return BigInt(value);
            return BigInt(0);
          };

          return {
            liquidity: toBigInt(native.liquidity),
            currentTick: Number(native.current_tick ?? 0),
            sqrtPriceX96: toBigInt(native.sqrt_price_x96 ?? 0),
            token0: String(native.token0 ?? ""),
            token1: String(native.token1 ?? ""),
            fee: Number(native.fee ?? 0),
            feesUncollected0: toBigInt(native.fees_uncollected_0),
            feesUncollected1: toBigInt(native.fees_uncollected_1),
            protocolFee: Number(native.protocol_fee ?? 0),
            tickSpacing: Number(native.tick_spacing ?? 0),
            positionManager: String(native.position_manager ?? ""),
          };
        }

        return null;
      } catch (e) {
        console.error("Failed to get pool state", e);
        return null;
      }
    },
    [address, rpcServer]
  );

  const quoteExactInput = useCallback(
    async ({
      poolAddress,
      tokenIn,
      tokenOut,
      fee,
      amountIn,
      sqrtPriceLimitX96 = [BigInt(0), BigInt(0)],
    }: QuoteExactInputParams): Promise<bigint | null> => {
      const quoterContractId = (
        (CONTRACT_IDS as Record<string, string | undefined>).quoter ??
        process.env.NEXT_PUBLIC_QUOTER_CONTRACT_ID ??
        ""
      ).trim();

      if (!quoterContractId || amountIn <= BigInt(0)) {
        return null;
      }

      try {
        const contract = new Contract(quoterContractId);
        const source = address && address.startsWith("G") ? address : NULL_ACCOUNT;

        const op = contract.call(
          "quote_exact_input",
          new Address(poolAddress).toScVal(),
          new Address(tokenIn).toScVal(),
          new Address(tokenOut).toScVal(),
          xdr.ScVal.scvU32(fee),
          toI128(amountIn),
          xdr.ScVal.scvVec([toU128(sqrtPriceLimitX96[0]), toU128(sqrtPriceLimitX96[1])])
        );

        const tx = new TransactionBuilder(new Account(source, "0"), {
          fee: "100",
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(op)
          .setTimeout(0)
          .build();

        const sim = await rpcServer.simulateTransaction(tx);
        if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
          return null;
        }

        const native = scValToNative(sim.result.retval);
        if (typeof native === "bigint") return native;
        if (typeof native === "number") return BigInt(Math.trunc(native));
        if (typeof native === "string") return BigInt(native);
        if (native && typeof native === "object" && "toString" in native) {
          return BigInt((native as { toString: () => string }).toString());
        }
        return null;
      } catch (e) {
        console.warn("[StellarContext] quote_exact_input simulation failed", e);
        return null;
      }
    },
    [address, rpcServer]
  );

  const fetchAllowanceValue = useCallback(
    async (tokenAddress: string, owner: string, spender: string): Promise<bigint> => {
      const contract = new Contract(tokenAddress);
      const allowanceOp = contract.call("allowance", new Address(owner).toScVal(), new Address(spender).toScVal());

      const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(allowanceOp)
        .setTimeout(0)
        .build();

      const sim = await rpcServer.simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
        return BigInt(0);
      }
      return BigInt(scValToNative(sim.result.retval).toString());
    },
    [rpcServer]
  );

  const waitForTransactionResult = useCallback(
    async (server: rpc.Server, hash: string, timeoutMs = 45000) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        try {
          const txResult = await server.getTransaction(hash);
          if (txResult.status === "SUCCESS") {
            return;
          }
          if (txResult.status === "FAILED") {
            throw new Error(`Approval transaction failed on-chain (hash: ${hash})`);
          }
        } catch {
          // Not found yet; continue polling.
        }
        await sleep(1000);
      }
      throw new Error(`Approval submitted but not confirmed in time (hash: ${hash})`);
    },
    []
  );

  const approveToken = useCallback(
    async (tokenAddress: string, spender: string, amount: bigint) => {
      if (!address) throw new Error("Wallet not connected");

      const contract = new Contract(tokenAddress);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const [account, ledgerResponse] = await Promise.all([
            rpcServer.getAccount(address),
            rpcServer.getLatestLedger(),
          ]);
          const expirationLedger = ledgerResponse.sequence + 100000;

          const op = contract.call(
            "approve",
            new Address(address).toScVal(),
            new Address(spender).toScVal(),
            toI128(amount),
            xdr.ScVal.scvU32(expirationLedger)
          );

          const tx = new TransactionBuilder(account, {
            fee: "1500",
            networkPassphrase: Networks.TESTNET,
          })
            .addOperation(op)
            .setTimeout(0)
            .build();

          const simResult = await rpcServer.simulateTransaction(tx);
          if (!rpc.Api.isSimulationSuccess(simResult)) {
            throw new Error("Approval simulation failed");
          }

          const preparedTx = rpc.assembleTransaction(tx, simResult).build();
          const { signedTxXdr } = await signTransaction(preparedTx.toXDR(), {
            networkPassphrase: NETWORK_PASSPHRASE,
            address,
          });
          const sendResult = await submitSignedTransaction(signedTxXdr);
          if (sendResult.hash) {
            await waitForTransactionResult(rpcServer, sendResult.hash);
          }

          // Ensure allowance is visible in the ledger before returning to caller.
          for (let i = 0; i < 15; i += 1) {
            const allowance = await fetchAllowanceValue(tokenAddress, address, spender);
            if (allowance >= amount) {
              return;
            }
            await sleep(1000);
          }
          throw new Error("Approval transaction submitted, but allowance not observed yet. Please retry.");
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isTxBadSeq = message.includes("txBadSeq");
          if (attempt === 0 && isTxBadSeq) {
            await sleep(1500);
            continue;
          }
          throw error;
        }
      }
    },
    [address, fetchAllowanceValue, rpcServer, signTransaction, submitSignedTransaction, waitForTransactionResult]
  );

  const checkAllowance = useCallback(async (tokenAddress: string, owner: string, spender: string): Promise<bigint> => {
    try {
      return await fetchAllowanceValue(tokenAddress, owner, spender);
    } catch (e) {
      console.error("Failed to check allowance", e);
      return BigInt(0);
    }
  }, [fetchAllowanceValue]);

  return (
    <StellarContext.Provider
      value={{
        address,
        walletType,
        connecting,
        connect,
        disconnect,
        getTokenBalance,
        mintToken,
        getPoolState,
        quoteExactInput,
        approveToken,
        checkAllowance,
        latestLedger,
        latestLedgerHash,
        ...clients,
      }}
    >
      {children}
    </StellarContext.Provider>
  );
};
