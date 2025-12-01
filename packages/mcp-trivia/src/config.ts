export interface Config {
    port: number;
    winningStreak: number;
    // Payment config
    aggregatorUrl: string;
    aggregatorApiKey: string;
    nostrRelayUrl: string;
    privateKeyHex: string;
    nametag: string;
    paymentCoinId: string;
    paymentAmount: bigint;
    dayPassHours: number;
    paymentTimeoutMs: number;
    dataDir: string;
    adminPassword: string;
}

export function loadConfig(): Config {
    const privateKeyHex = process.env.TRIVIA_PRIVATE_KEY;
    if (!privateKeyHex || privateKeyHex.length !== 64) {
        throw new Error('TRIVIA_PRIVATE_KEY must be a 64-character hex string');
    }

    const nametag = process.env.TRIVIA_NAMETAG;
    if (!nametag) {
        throw new Error('TRIVIA_NAMETAG is required');
    }

    const aggregatorUrl = process.env.AGGREGATOR_URL;
    if (!aggregatorUrl) {
        throw new Error('AGGREGATOR_URL is required');
    }

    const nostrRelayUrl = process.env.NOSTR_RELAY_URL;
    if (!nostrRelayUrl) {
        throw new Error('NOSTR_RELAY_URL is required');
    }

    const paymentCoinId = process.env.PAYMENT_COIN_ID;
    if (!paymentCoinId) {
        throw new Error('PAYMENT_COIN_ID is required');
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        throw new Error('ADMIN_PASSWORD is required');
    }

    return {
        port: parseInt(process.env.PORT || '3001', 10),
        winningStreak: parseInt(process.env.WINNING_STREAK || '10', 10),
        aggregatorUrl,
        aggregatorApiKey: process.env.AGGREGATOR_API_KEY || 'sk_06365a9c44654841a366068bcfc68986',
        nostrRelayUrl,
        privateKeyHex,
        nametag,
        paymentCoinId,
        paymentAmount: BigInt(process.env.PAYMENT_AMOUNT || '1000000000'),
        dayPassHours: parseInt(process.env.DAY_PASS_HOURS || '24', 10),
        paymentTimeoutMs: parseInt(process.env.PAYMENT_TIMEOUT_SECONDS || '120', 10) * 1000,
        dataDir: process.env.DATA_DIR || './data',
        adminPassword,
    };
}
