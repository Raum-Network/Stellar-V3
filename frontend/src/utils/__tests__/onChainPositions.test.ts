import { afterEach, describe, expect, it, vi } from "vitest";
import { countOnChainPositions, fetchOnChainPositions } from "../onChainPositions";

const MINT_SYMBOL_B64 = "AAAADwAAAARtaW50";
const BURN_SYMBOL_B64 = "AAAADwAAAARidXJu";

const encodePositionId = (id: number) =>
  btoa(String.fromCharCode(0x06, 0, 0, 0, 0, 0, 0, 0, id));

describe("onChainPositions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("counts mint and burn operations from horizon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                id: "10000",
                type: "invoke_host_function",
                created_at: "2026-01-01T00:00:00Z",
                transaction_hash: "tx1",
                source_account: "GABC",
                parameters: [{ value: MINT_SYMBOL_B64, type: "scvSymbol" }],
              },
              {
                id: "10001",
                type: "invoke_host_function",
                created_at: "2026-01-01T00:01:00Z",
                transaction_hash: "tx2",
                source_account: "GABC",
                parameters: [{ value: BURN_SYMBOL_B64, type: "scvSymbol" }],
              },
            ],
          },
        }),
      })
    );

    const result = await countOnChainPositions("GABC");
    expect(result).toEqual({ mints: 1, burns: 1, active: 0 });
  });

  it("fetches active positions using rpc returnValue and burn heuristic", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/accounts/GWALLET/operations")) {
        return {
          ok: true,
          json: async () => ({
            _embedded: {
              records: [
                {
                  id: "123450000",
                  type: "invoke_host_function",
                  created_at: "2026-01-01T00:00:00Z",
                  transaction_hash: "mint-old",
                  source_account: "GWALLET",
                  parameters: [{ value: MINT_SYMBOL_B64, type: "scvSymbol" }],
                },
                {
                  id: "123460000",
                  type: "invoke_host_function",
                  created_at: "2026-01-01T00:10:00Z",
                  transaction_hash: "burn-1",
                  source_account: "GWALLET",
                  parameters: [{ value: BURN_SYMBOL_B64, type: "scvSymbol" }],
                },
                {
                  id: "123470000",
                  type: "invoke_host_function",
                  created_at: "2026-01-01T00:20:00Z",
                  transaction_hash: "mint-new",
                  source_account: "GWALLET",
                  parameters: [{ value: MINT_SYMBOL_B64, type: "scvSymbol" }],
                },
              ],
            },
          }),
        };
      }

      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const hash = body?.params?.hash;
      if (hash === "mint-old") {
        return {
          ok: true,
          json: async () => ({
            result: { status: "SUCCESS", returnValue: encodePositionId(7) },
          }),
        };
      }
      if (hash === "mint-new") {
        return {
          ok: true,
          json: async () => ({
            result: { status: "SUCCESS", returnValue: encodePositionId(8) },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({ result: null }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const positions = await fetchOnChainPositions("GWALLET");
    expect(positions).toHaveLength(1);
    expect(positions[0].positionId).toBe(8);
    expect(positions[0].isActive).toBe(true);
  });

  it("returns empty positions when horizon request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
    );

    const positions = await fetchOnChainPositions("GBROKEN");
    expect(positions).toEqual([]);
  });

  it("falls back to sequential position IDs when RPC data is missing", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/accounts/GFALLBACK/operations")) {
        return {
          ok: true,
          json: async () => ({
            _embedded: {
              records: [
                {
                  id: "223450000",
                  type: "invoke_host_function",
                  created_at: "2026-01-01T00:00:00Z",
                  transaction_hash: "mint-fallback",
                  source_account: "GFALLBACK",
                  parameters: [{ value: MINT_SYMBOL_B64, type: "scvSymbol" }],
                },
              ],
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ result: { status: "FAILED" } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const positions = await fetchOnChainPositions("GFALLBACK");
    expect(positions).toHaveLength(1);
    expect(positions[0].positionId).toBe(1);
  });

  it("can report negative active count when burns exceed mints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          _embedded: {
            records: [
              {
                id: "10001",
                type: "invoke_host_function",
                created_at: "2026-01-01T00:01:00Z",
                transaction_hash: "tx-burn-only",
                source_account: "GABC",
                parameters: [{ value: BURN_SYMBOL_B64, type: "scvSymbol" }],
              },
            ],
          },
        }),
      })
    );

    const result = await countOnChainPositions("GABC");
    expect(result).toEqual({ mints: 0, burns: 1, active: -1 });
  });
});
