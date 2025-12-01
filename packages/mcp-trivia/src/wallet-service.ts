import * as fs from 'fs';
import * as path from 'path';
import { Token } from '@unicitylabs/state-transition-sdk/lib/token/Token.js';
import type { Config } from './config.js';

export interface TokenBalance {
    coinId: string;
    amount: bigint;
    tokenCount: number;
}

export interface WalletSummary {
    balances: TokenBalance[];
    totalTokens: number;
}

export class WalletService {
    private config: Config;

    constructor(config: Config) {
        this.config = config;
    }

    async getWalletSummary(): Promise<WalletSummary> {
        const tokensDir = path.join(this.config.dataDir, 'tokens');

        if (!fs.existsSync(tokensDir)) {
            return { balances: [], totalTokens: 0 };
        }

        const files = fs.readdirSync(tokensDir).filter((f) => f.endsWith('.json'));
        const balanceMap = new Map<string, { amount: bigint; count: number }>();

        for (const file of files) {
            try {
                const filePath = path.join(tokensDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                const token = await Token.fromJSON(data.token);

                const coinData = this.extractCoinData(token);
                if (coinData) {
                    const existing = balanceMap.get(coinData.coinId) || { amount: BigInt(0), count: 0 };
                    balanceMap.set(coinData.coinId, {
                        amount: existing.amount + coinData.amount,
                        count: existing.count + 1,
                    });
                }
            } catch (error) {
                console.error(`[Wallet] Error reading token file ${file}:`, error);
            }
        }

        const balances: TokenBalance[] = [];
        for (const [coinId, data] of balanceMap) {
            balances.push({
                coinId,
                amount: data.amount,
                tokenCount: data.count,
            });
        }

        return {
            balances,
            totalTokens: files.length,
        };
    }

    private extractCoinData(token: Token<any>): { coinId: string; amount: bigint } | null {
        try {
            const coinsOpt = token.coins;
            if (!coinsOpt) return null;

            const rawCoins = coinsOpt.coins;

            let key: any = null;
            let val: any = null;

            if (Array.isArray(rawCoins)) {
                const firstItem = rawCoins[0];
                if (Array.isArray(firstItem) && firstItem.length === 2) {
                    key = firstItem[0];
                    val = firstItem[1];
                }
            } else if (typeof rawCoins === 'object') {
                const keys = Object.keys(rawCoins);
                if (keys.length > 0) {
                    key = keys[0];
                    val = (rawCoins as any)[key];
                }
            }

            if (!key || !val) return null;

            const bytes = key.data || key;
            const coinId = Buffer.from(bytes).toString('hex');
            const amount = BigInt(val.toString());

            return { coinId, amount };
        } catch (error) {
            console.error('[Wallet] Error extracting coin data:', error);
            return null;
        }
    }
}
