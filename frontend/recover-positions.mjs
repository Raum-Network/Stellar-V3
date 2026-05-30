#!/usr/bin/env node
/**
 * Position Recovery Script
 * Queries the Pool contract to find all positions owned by a wallet
 * and identifies which ones still have liquidity to recover
 */

import pkg from '@stellar/stellar-sdk';
const { SorobanRpc, xdr, scValToNative, nativeToScVal, Address } = pkg;

const RPC_URL = 'https://soroban-testnet.stellar.org';
const POOL_CONTRACT = 'CCIHG4P25PYMU5VDX3PBGTVOBNWTKS336KW4MW4C5LALFPU4CUAL5XT5';
const WALLET = 'GAEMFS2GUOWKPW62MF5TNM6YDV76OLAHC7ATBKQSKYMAF36GKLI76KZ5';

async function main() {
    const server = new SorobanRpc.Server(RPC_URL);

    console.log('='.repeat(60));
    console.log('POSITION RECOVERY SCANNER');
    console.log('='.repeat(60));
    console.log('Pool Contract:', POOL_CONTRACT);
    console.log('Wallet:', WALLET);
    console.log('');

    const foundPositions = [];

    // Query positions 1-100 (positions are sequential u64 IDs)
    for (let positionId = 1; positionId <= 100; positionId++) {
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

                console.log(`Position ${positionId}:`);
                console.log(`  Owner: ${position.owner}`);
                console.log(`  Liquidity: ${position.liquidity}`);
                console.log(`  Tick Range: ${position.tick_lower} to ${position.tick_upper}`);
                console.log(`  Fees Owed: ${position.fees_owed_0}, ${position.fees_owed_1}`);

                // Check if this is our wallet's position with liquidity
                if (position.owner === WALLET && BigInt(position.liquidity) > 0n) {
                    console.log(`  ⚠️  RECOVERABLE! Position ${positionId} has ${position.liquidity} liquidity`);
                    foundPositions.push({
                        id: positionId,
                        liquidity: position.liquidity,
                        tickLower: position.tick_lower,
                        tickUpper: position.tick_upper
                    });
                }
                console.log('');
            }
        } catch (err) {
            // Position doesn't exist, continue
            if (positionId % 10 === 0) {
                console.log(`Checked positions up to ${positionId}...`);
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
