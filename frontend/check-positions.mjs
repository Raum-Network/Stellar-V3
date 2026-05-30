import { rpc, Address, scValToNative, xdr } from '@stellar/stellar-sdk';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const POSITION_MANAGER = 'CCIHG4P25PYMU5VDX3PBGTVOBNWTKS336KW4MW4C5LALFPU4CUAL5XT5';
const WALLET = 'GAEMFS2GUOWKPW62MF5TNM6YDV76OLAHC7ATBKQSKYMAF36GKLI76KZ5';

async function queryPositions() {
    const server = new rpc.Server(RPC_URL);

    // Try to get contract events related to this wallet
    console.log('Checking contract events...');

    try {
        // Get recent events from the contract
        const latestLedger = await server.getLatestLedger();
        console.log('Latest ledger:', latestLedger.sequence);

        // Query events from recent ledgers
        const startLedger = latestLedger.sequence - 17280; // ~1 day back
        console.log('Searching from ledger:', startLedger);

        const events = await server.getEvents({
            startLedger: startLedger,
            filters: [{
                type: 'contract',
                contractIds: [POSITION_MANAGER]
            }],
            pagination: { limit: 100 }
        });

        console.log('Total events found:', events.events?.length || 0);

        // Look for mint events (position creation)
        let mintCount = 0;
        let burnCount = 0;

        for (const event of events.events || []) {
            // Check if event involves our wallet
            const topicStrings = event.topic?.map(t => {
                try {
                    return scValToNative(xdr.ScVal.fromXDR(t, 'base64'));
                } catch {
                    return t;
                }
            }) || [];

            console.log('Event topics:', topicStrings);

            if (topicStrings.includes('mint')) {
                mintCount++;
            }
            if (topicStrings.includes('burn')) {
                burnCount++;
            }
        }

        console.log('Mint events:', mintCount);
        console.log('Burn events:', burnCount);
        console.log('Net positions:', mintCount - burnCount);

    } catch (e) {
        console.error('Error querying events:', e);
    }
}

queryPositions();
