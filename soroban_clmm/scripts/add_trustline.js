const { Asset, Operation, TransactionBuilder, Networks, Keypair, Horizon } = require('@stellar/stellar-sdk');

async function addTrustline() {
    const server = new Horizon.Server('https://horizon-testnet.stellar.org');
    const adminAddress = process.env.ADMIN_ADDRESS;
    const userSecret = process.env.USER_SECRET; // User secret needed to sign

    if (!adminAddress || !userSecret) {
        console.error("Missing ADMIN_ADDRESS or USER_SECRET");
        process.exit(1);
    }

    const userKeypair = Keypair.fromSecret(userSecret);
    const asset = new Asset('USDC', adminAddress);

    try {
        const account = await server.loadAccount(userKeypair.publicKey());
        const transaction = new TransactionBuilder(account, {
            fee: '10000',
            networkPassphrase: Networks.TESTNET,
        })
            .addOperation(Operation.changeTrust({ asset }))
            .setTimeout(30)
            .build();

        transaction.sign(userKeypair);
        await server.submitTransaction(transaction);
        console.log(`Trustline added for ${userKeypair.publicKey()}`);
    } catch (e) {
        console.error("Failed to add trustline", e.response ? e.response.data : e);
        process.exit(1);
    }
}

addTrustline();
