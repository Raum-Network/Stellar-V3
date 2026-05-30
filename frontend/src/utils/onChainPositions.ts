// Utility to fetch on-chain positions from Horizon and Soroban RPC APIs
// Uses Soroban RPC for recent transactions (within retention period)
// Falls back to sequential ID estimation for older transactions

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
const DEBUG_ONCHAIN = process.env.NEXT_PUBLIC_DEBUG_ONCHAIN === 'true';

// Base64 encoded function names
const MINT_SYMBOL_B64 = 'AAAADwAAAARtaW50'; // "mint"
const BURN_SYMBOL_B64 = 'AAAADwAAAARidXJu'; // "burn"

export interface OnChainPosition {
    positionId: number;
    transactionHash: string;
    createdAt: string;
    ledger: number;
    isActive: boolean;
    tickLower?: number;
    tickUpper?: number;
}

interface HorizonOperation {
    id: string;
    type: string;
    created_at: string;
    transaction_hash: string;
    source_account: string;
    parameters?: Array<{
        value: string;
        type: string;
    }>;
}

interface HorizonResponse {
    _embedded: {
        records: HorizonOperation[];
    };
}

interface SorobanRPCResponse {
    result?: {
        status: string;
        returnValue?: string; // Base64 encoded ScVal
    };
}

function onChainLog(...args: unknown[]): void {
    if (DEBUG_ONCHAIN) {
        console.log(...args);
    }
}

/**
 * Fetches all invoke_host_function operations for a wallet from Horizon API
 */
async function fetchWalletOperations(walletAddress: string, limit: number = 200): Promise<HorizonOperation[]> {
    const url = `${HORIZON_URL}/accounts/${walletAddress}/operations?limit=${limit}&order=desc`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Horizon API error: ${response.status}`);
        }

        const data: HorizonResponse = await response.json();
        return data._embedded.records.filter(op => op.type === 'invoke_host_function');
    } catch (error) {
        console.error('[OnChain] Failed to fetch wallet operations:', error);
        return [];
    }
}

/**
 * Get transaction result from Soroban RPC
 */
async function getTransactionFromRPC(txHash: string): Promise<SorobanRPCResponse['result'] | null> {
    try {
        const response = await fetch(SOROBAN_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTransaction',
                params: { hash: txHash }
            })
        });

        if (!response.ok) return null;

        const data: { result?: SorobanRPCResponse['result'] } = await response.json();
        return data.result || null;
    } catch (error) {
        console.error('[OnChain] Failed to get transaction from RPC:', txHash.slice(0, 12), error);
        return null;
    }
}

/**
 * Parse position ID from Soroban RPC returnValue
 * The returnValue is a base64-encoded ScVal containing (position_id, amount0, amount1)
 */
function parsePositionIdFromReturnValue(returnValue: string): number | null {
    try {
        // returnValue is base64 encoded ScVal
        // For a tuple (u64, i128, i128), the first few bytes after type marker contain the position ID
        const bytes = atob(returnValue);

        // ScVal structure for vec/tuple starts with type marker
        // For position_id (u64), we look for the pattern
        // This is a simplified parser that extracts the first u64 value

        // Find u64 type marker (0x06 = ScValType::U64) and extract the value
        for (let i = 0; i < bytes.length - 8; i++) {
            // u64 ScVal starts with type byte 0x06 (6 in decimal)
            if (bytes.charCodeAt(i) === 0x06) {
                // Next 8 bytes are the u64 value (big-endian)
                let value = BigInt(0);
                for (let j = 0; j < 8; j++) {
                    value = (value << BigInt(8)) | BigInt(bytes.charCodeAt(i + 1 + j));
                }
                if (value > 0 && value < 1000000) { // Reasonable position ID range
                    return Number(value);
                }
            }
        }

        onChainLog('[OnChain] Could not find position ID in returnValue');
        return null;
    } catch (error) {
        console.error('[OnChain] Failed to parse returnValue:', error);
        return null;
    }
}

/**
 * Check if an operation is a mint (position creation) call
 */
function isMintOperation(op: HorizonOperation): boolean {
    return op.parameters?.some(p => p.value === MINT_SYMBOL_B64) || false;
}

/**
 * Check if an operation is a burn (position removal) call
 */
function isBurnOperation(op: HorizonOperation): boolean {
    return op.parameters?.some(p => p.value === BURN_SYMBOL_B64) || false;
}

/**
 * Fetches on-chain positions for a wallet by analyzing mint/burn transactions
 * Uses Soroban RPC for recent transactions, sequential estimation for older ones
 */
export async function fetchOnChainPositions(walletAddress: string): Promise<OnChainPosition[]> {
    onChainLog('[OnChain] Fetching positions for wallet:', walletAddress);

    const operations = await fetchWalletOperations(walletAddress);
    onChainLog('[OnChain] Total operations found:', operations.length);

    // Collect mint and burn operations
    const mintOps: HorizonOperation[] = [];
    const burnCount = { value: 0 };

    for (const op of operations) {
        if (isMintOperation(op)) {
            mintOps.push(op);
            onChainLog('[OnChain] Found mint tx:', op.transaction_hash.slice(0, 12));
        }
        if (isBurnOperation(op)) {
            burnCount.value++;
            onChainLog('[OnChain] Found burn tx:', op.transaction_hash.slice(0, 12));
        }
    }

    onChainLog('[OnChain] Total mints:', mintOps.length, 'burns:', burnCount.value);

    // Sort mints by time (oldest first) to assign sequential IDs
    mintOps.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Resolve RPC transaction lookups in parallel to avoid serial network latency per mint.
    const positionIds = await Promise.all(
        mintOps.map(async (mintOp) => {
            const txResult = await getTransactionFromRPC(mintOp.transaction_hash);
            if (txResult?.status !== 'SUCCESS' || !txResult.returnValue) {
                return null;
            }

            const positionId = parsePositionIdFromReturnValue(txResult.returnValue);
            if (positionId !== null) {
                onChainLog('[OnChain] Got position ID from RPC:', positionId, 'for tx:', mintOp.transaction_hash.slice(0, 12));
            }
            return positionId;
        })
    );

    const positions: OnChainPosition[] = mintOps.map((mintOp, index) => {
        const fallbackPositionId = index + 1;
        const positionId = positionIds[index] ?? fallbackPositionId;

        if (positionIds[index] === null) {
            onChainLog('[OnChain] Using fallback position ID:', positionId, 'for tx:', mintOp.transaction_hash.slice(0, 12));
        }

        return {
            positionId,
            transactionHash: mintOp.transaction_hash,
            createdAt: mintOp.created_at,
            ledger: parseInt(mintOp.id.slice(0, -4), 10),
            isActive: true, // Will mark inactive below
        };
    });

    // Mark the oldest N positions as burned (simple heuristic)
    // This isn't perfect but works for most cases
    for (let i = 0; i < burnCount.value && i < positions.length; i++) {
        positions[i].isActive = false;
    }

    // Return only active positions, sorted newest first
    const activePositions = positions
        .filter(p => p.isActive)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    onChainLog('[OnChain] Active positions:', activePositions.length);
    onChainLog('[OnChain] Position IDs:', activePositions.map(p => p.positionId));

    return activePositions;
}

/**
 * Count positions for a wallet (quick check without full position details)
 */
export async function countOnChainPositions(walletAddress: string): Promise<{ mints: number; burns: number; active: number }> {
    const operations = await fetchWalletOperations(walletAddress);

    let mints = 0;
    let burns = 0;

    for (const op of operations) {
        if (isMintOperation(op)) mints++;
        if (isBurnOperation(op)) burns++;
    }

    return {
        mints,
        burns,
        active: mints - burns
    };
}
