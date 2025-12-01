import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Token } from '@unicitylabs/state-transition-sdk/lib/token/Token.js';
import { TokenId } from '@unicitylabs/state-transition-sdk/lib/token/TokenId.js';
import { TokenType } from '@unicitylabs/state-transition-sdk/lib/token/TokenType.js';
import { TokenState } from '@unicitylabs/state-transition-sdk/lib/token/TokenState.js';
import { SigningService } from '@unicitylabs/state-transition-sdk/lib/sign/SigningService.js';
import { MintCommitment } from '@unicitylabs/state-transition-sdk/lib/transaction/MintCommitment.js';
import { MintTransactionData } from '@unicitylabs/state-transition-sdk/lib/transaction/MintTransactionData.js';
import { UnmaskedPredicate } from '@unicitylabs/state-transition-sdk/lib/predicate/embedded/UnmaskedPredicate.js';
import { UnmaskedPredicateReference } from '@unicitylabs/state-transition-sdk/lib/predicate/embedded/UnmaskedPredicateReference.js';
import { HashAlgorithm } from '@unicitylabs/state-transition-sdk/lib/hash/HashAlgorithm.js';
import { StateTransitionClient } from '@unicitylabs/state-transition-sdk/lib/StateTransitionClient.js';
import { AggregatorClient } from '@unicitylabs/state-transition-sdk/lib/api/AggregatorClient.js';
import { RootTrustBase } from '@unicitylabs/state-transition-sdk/lib/bft/RootTrustBase.js';
import { ProxyAddress } from '@unicitylabs/state-transition-sdk/lib/address/ProxyAddress.js';
import { waitInclusionProof } from '@unicitylabs/state-transition-sdk/lib/util/InclusionProofUtils.js';
import { NostrKeyManager, NostrClient } from '@unicitylabs/nostr-js-sdk';
import type { DirectAddress } from '@unicitylabs/state-transition-sdk/lib/address/DirectAddress.js';
import type { Config } from './config.js';
import trustbaseJson from './trustbase-testnet.json' with { type: 'json' };

const UNICITY_TOKEN_TYPE_HEX = 'f8aa13834268d29355ff12183066f0cb902003629bbc5eb9ef0efbe397867509';

export interface StoredIdentity {
    privateKeyHex: string;
    createdAt: number;
}

export interface Identity {
    privateKeyHex: string;
    publicKeyHex: string;
    nametag: string;
    walletAddress: string;
}

export class IdentityService {
    private config: Config;
    private aggregatorClient: AggregatorClient;
    private stateTransitionClient: StateTransitionClient;
    private rootTrustBase: RootTrustBase;
    private identity: Identity | null = null;
    private signingService: SigningService | null = null;
    private nametagToken: Token<any> | null = null;

    constructor(config: Config) {
        this.config = config;
        this.aggregatorClient = new AggregatorClient(config.aggregatorUrl, config.aggregatorApiKey);
        this.stateTransitionClient = new StateTransitionClient(this.aggregatorClient);
        this.rootTrustBase = RootTrustBase.fromJSON(trustbaseJson);
    }

    async initialize(): Promise<void> {
        console.log('[Identity] Initializing...');

        // Ensure data directory exists
        this.ensureDataDir();

        // Load or create identity (private key)
        const privateKeyHex = this.loadOrCreateIdentity();

        // Create signing service from private key
        const secret = Buffer.from(privateKeyHex, 'hex');
        this.signingService = await SigningService.createFromSecret(secret);
        const publicKeyHex = Buffer.from(this.signingService.publicKey).toString('hex');

        // Derive wallet address
        const walletAddress = await this.deriveWalletAddress();

        this.identity = {
            privateKeyHex,
            publicKeyHex,
            nametag: this.config.nametag,
            walletAddress,
        };

        console.log(`[Identity] Nametag: @${this.config.nametag}`);
        console.log(`[Identity] Public Key: ${publicKeyHex.slice(0, 16)}...`);

        // Check and ensure nametag exists
        await this.ensureNametag();

        // Ensure Nostr binding is published
        await this.ensureNostrBinding();
    }

    private ensureDataDir(): void {
        if (!fs.existsSync(this.config.dataDir)) {
            fs.mkdirSync(this.config.dataDir, { recursive: true });
            console.log(`[Identity] Created data directory: ${this.config.dataDir}`);
        }
    }

    private getIdentityPath(): string {
        return path.join(this.config.dataDir, 'identity.json');
    }

    private getNametagPath(): string {
        return path.join(this.config.dataDir, `nametag-${this.config.nametag}.json`);
    }

    private loadOrCreateIdentity(): string {
        const identityPath = this.getIdentityPath();

        // First check if identity file exists
        if (fs.existsSync(identityPath)) {
            try {
                const data = fs.readFileSync(identityPath, 'utf-8');
                const stored: StoredIdentity = JSON.parse(data);
                console.log(`[Identity] Loaded existing identity from ${identityPath}`);
                return stored.privateKeyHex;
            } catch (error) {
                console.warn(`[Identity] Failed to load identity file, will create new:`, error);
            }
        }

        // Check if provided via environment
        if (this.config.privateKeyHex) {
            const identity: StoredIdentity = {
                privateKeyHex: this.config.privateKeyHex,
                createdAt: Date.now(),
            };
            fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
            console.log(`[Identity] Saved identity from env vars to ${identityPath}`);
            return identity.privateKeyHex;
        }

        // Generate new identity
        const privateKeyHex = randomBytes(32).toString('hex');
        const identity: StoredIdentity = {
            privateKeyHex,
            createdAt: Date.now(),
        };

        fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
        console.log(`[Identity] Generated new identity and saved to ${identityPath}`);

        return privateKeyHex;
    }

    private async deriveWalletAddress(): Promise<string> {
        if (!this.signingService) {
            throw new Error('Signing service not initialized');
        }

        const tokenType = new TokenType(Buffer.from(UNICITY_TOKEN_TYPE_HEX, 'hex'));

        const predicateRef = UnmaskedPredicateReference.create(
            tokenType,
            this.signingService.algorithm,
            this.signingService.publicKey,
            HashAlgorithm.SHA256
        );

        const address = await (await predicateRef).toAddress();
        return address.toString();
    }

    private async getOwnerAddress(): Promise<DirectAddress> {
        if (!this.signingService) {
            throw new Error('Signing service not initialized');
        }

        const tokenType = new TokenType(Buffer.from(UNICITY_TOKEN_TYPE_HEX, 'hex'));

        const predicateRef = UnmaskedPredicateReference.create(
            tokenType,
            this.signingService.algorithm,
            this.signingService.publicKey,
            HashAlgorithm.SHA256
        );

        return (await predicateRef).toAddress();
    }

    private async ensureNametag(): Promise<void> {
        const storedToken = await this.loadNametagFromStorage();
        if (storedToken) {
            console.log('[Identity] Loaded existing nametag token from storage');
            this.nametagToken = storedToken;
            return;
        }

        console.log(`[Identity] No existing nametag found, minting @${this.config.nametag}...`);
        await this.mintNametag();
    }

    private async mintNametag(): Promise<void> {
        if (!this.signingService || !this.rootTrustBase) {
            throw new Error('Signing service or trust base not initialized');
        }

        const nametag = this.config.nametag;
        const ownerAddress = await this.getOwnerAddress();

        const nametagTokenId = await TokenId.fromNameTag(nametag);
        const nametagTokenType = new TokenType(Buffer.from(UNICITY_TOKEN_TYPE_HEX, 'hex'));

        const MAX_RETRIES = 3;
        let commitment: MintCommitment<any> | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const salt = randomBytes(32);

                const mintData = await MintTransactionData.createFromNametag(
                    nametag,
                    nametagTokenType,
                    ownerAddress,
                    salt,
                    ownerAddress
                );

                commitment = await MintCommitment.create(mintData);

                console.log(`[Identity] Submitting mint commitment (attempt ${attempt})...`);
                const response = await this.stateTransitionClient.submitMintCommitment(commitment);

                if (response.status === 'SUCCESS') {
                    console.log('[Identity] Commitment accepted!');
                    break;
                } else {
                    console.warn(`[Identity] Commitment failed: ${response.status}`);
                    if (attempt === MAX_RETRIES) {
                        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${response.status}`);
                    }
                    await this.sleep(1000 * attempt);
                }
            } catch (error) {
                console.error(`[Identity] Attempt ${attempt} error:`, error);
                if (attempt === MAX_RETRIES) throw error;
                await this.sleep(1000 * attempt);
            }
        }

        if (!commitment) {
            throw new Error('Failed to create commitment');
        }

        console.log('[Identity] Waiting for inclusion proof...');
        const inclusionProof = await waitInclusionProof(
            this.rootTrustBase,
            this.stateTransitionClient,
            commitment
        );

        const genesisTransaction = commitment.toTransaction(inclusionProof);
        const txData = commitment.transactionData;
        const mintSalt = txData.salt;

        const nametagPredicate = await UnmaskedPredicate.create(
            nametagTokenId,
            nametagTokenType,
            this.signingService,
            HashAlgorithm.SHA256,
            mintSalt
        );

        const token = await Token.mint(
            this.rootTrustBase,
            new TokenState(nametagPredicate, null),
            genesisTransaction
        );

        console.log(`[Identity] Nametag @${nametag} minted successfully!`);

        this.nametagToken = token;
        this.saveNametagToStorage(token);
    }

    private async ensureNostrBinding(): Promise<void> {
        console.log('[Identity] Checking Nostr binding...');

        if (!this.identity) {
            throw new Error('Identity not initialized');
        }

        const secretKey = Buffer.from(this.identity.privateKeyHex, 'hex');
        const keyManager = NostrKeyManager.fromPrivateKey(secretKey);
        const client = new NostrClient(keyManager);

        try {
            await client.connect(this.config.nostrRelayUrl);

            const existingPubkey = await client.queryPubkeyByNametag(this.config.nametag);

            if (existingPubkey === keyManager.getPublicKeyHex()) {
                console.log('[Identity] Nostr binding already exists and matches');
                client.disconnect();
                return;
            }

            if (existingPubkey) {
                console.warn(`[Identity] Warning: Binding exists but for different pubkey: ${existingPubkey.slice(0, 16)}...`);
            }

            const proxyAddress = await ProxyAddress.fromNameTag(this.config.nametag);
            console.log(`[Identity] Publishing Nostr binding: @${this.config.nametag}`);

            const published = await client.publishNametagBinding(
                this.config.nametag,
                proxyAddress.address
            );

            if (published) {
                console.log('[Identity] Nostr binding published successfully!');
            } else {
                console.warn('[Identity] Warning: Nostr binding publish may have failed');
            }

            client.disconnect();
        } catch (error) {
            console.error('[Identity] Error ensuring Nostr binding:', error);
            try {
                client.disconnect();
            } catch {
                // Ignore disconnect errors
            }
            throw error;
        }
    }

    private async loadNametagFromStorage(): Promise<Token<any> | null> {
        const nametagPath = this.getNametagPath();
        if (!fs.existsSync(nametagPath)) {
            return null;
        }

        try {
            const data = fs.readFileSync(nametagPath, 'utf-8');
            const json = JSON.parse(data);
            const token = await Token.fromJSON(json.token);
            return token;
        } catch (error) {
            console.error('[Identity] Failed to load nametag from storage:', error);
            return null;
        }
    }

    private saveNametagToStorage(token: Token<any>): void {
        const nametagPath = this.getNametagPath();
        const data = {
            nametag: this.config.nametag,
            token: token.toJSON(),
            timestamp: Date.now(),
        };
        fs.writeFileSync(nametagPath, JSON.stringify(data, null, 2));
        console.log(`[Identity] Nametag token saved to ${nametagPath}`);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    getIdentity(): Identity {
        if (!this.identity) {
            throw new Error('Identity not initialized');
        }
        return this.identity;
    }

    getSigningService(): SigningService {
        if (!this.signingService) {
            throw new Error('Signing service not initialized');
        }
        return this.signingService;
    }

    getNametagToken(): Token<any> | null {
        return this.nametagToken;
    }

    getStateTransitionClient(): StateTransitionClient {
        return this.stateTransitionClient;
    }

    getRootTrustBase(): RootTrustBase {
        return this.rootTrustBase;
    }
}
