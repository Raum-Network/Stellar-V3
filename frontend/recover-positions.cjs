#!/usr/bin/env node
/**
 * Position Recovery Script
 * Queries the Pool contract to find all positions owned by a wallet
 * and identifies which ones still have liquidity to recover
 */

const sdk = require('@stellar/stellar-sdk');
const { rpc, xdr, scValToNative, nativeToScVal, Address } = sdk;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const POOL_CONTRACT = 'CCIHG4P25PYMU5VDX3PBGTVOBNWTKS336KW4MW4C5LALFPU4CUAL5XT5';
const WALLET = 'GAEMFS2GUOWKPW62MF5TNM6YDV76OLAHC7ATBKQSKYMAF36GKLI76KZ5';

async function main() {
    const server = new rpc.Server(RPC_URL);

    console.log('='.repeat(60));
    console.log('POSITION RECOVERY SCANNER');
    console.log('='.repeat(60));
    console.log('Pool Contract:', POOL_CONTRACT);
    console.log('Wallet:', WALLET);
    console.log('');

    const foundPositions = [];

    // Query positions 1-50 (positions are sequential u64 IDs)
    for (let positionId = 1; positionId <= 50; positionId++) {
        try {
            // Create the storage key: Position(u64)
            // DataKey::Position(id) is an enum variant with the id as value
            const storageKey = xdr.ScVal.scvVec([
                xdr.ScVal.scvSymbol('Position'),
                nativeToScVal(positionId, { type: 'u64' })
            ]);

            const ledgerKey = xdr.LedgerKey.contractData(
                new xdr.LedgerKeyContractData({
                    contract: new Address(POOL_CONTRACT).toScAddress(),
                    key: storageKey,
                    durability: xdr.ContractDataDurability.persistent()
                })
            );

            const entries = await server.getLedgerEntries(ledgerKey);

            if (entries.entries && entries.entries.length > 0) {
                const entry = entries.entries[0];
                const data = entry.val.contractData();
                const position = scValToNative(data.val());

                const ownerStr = typeof position.owner === 'string' ? position.owner : position.owner.toString();
                const liquidity = BigInt(position.liquidity || 0);

                console.log(`Position ${positionId}:`);
                console.log(`  Owner: ${ownerStr}`);
                console.log(`  Liquidity: ${liquidity}`);
                console.log(`  Tick Range: ${position.tick_lower} to ${position.tick_upper}`);

                // Check if this is our wallet's position with liquidity
                if (ownerStr === WALLET && liquidity > 0n) {
                    console.log(`  ⚠️  RECOVERABLE! Position ${positionId} has ${liquidity} liquidity`);
                    foundPositions.push({
                        id: positionId,
                        liquidity: liquidity.toString(),
                        tickLower: position.tick_lower,
                        tickUpper: position.tick_upper
                    });
                }
                console.log('');
            }
        } catch (err) {
            // Position doesn't exist, continue silently for most
            if (err.message && !err.message.includes('not found')) {
                console.log(`Position ${positionId}: Error - ${err.message}`);
            }
        }
    }

    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    if (foundPositions.length === 0) {
        console.log('No recoverable positions found.');
    } else {
        console.log(`Found ${foundPositions.length} positions with liquidity to recover:`);
        for (const pos of foundPositions) {
            console.log(`  Position ID ${pos.id}: ${pos.liquidity} liquidity (ticks ${pos.tickLower} to ${pos.tickUpper})`);
        }
        console.log('');
        console.log('To recover these positions, use these IDs when calling burn()');
    }
}

main().catch(console.error);
