import {
    NostrClient,
    NostrKeyManager,
    Filter,
    EventKinds,
    TokenTransferProtocol,
} from '@unicitylabs/nostr-js-sdk';
import type { Event } from '@unicitylabs/nostr-js-sdk';
import { Token } from '@unicitylabs/state-transition-sdk/lib/token/Token.js';
import { TransferTransaction } from '@unicitylabs/state-transition-sdk/lib/transaction/TransferTransaction.js';
import { AddressScheme } from '@unicitylabs/state-transition-sdk/lib/address/AddressScheme.js';
import { UnmaskedPredicate } from '@unicitylabs/state-transition-sdk/lib/predicate/embedded/UnmaskedPredicate.js';
import { HashAlgorithm } from '@unicitylabs/state-transition-sdk/lib/hash/HashAlgorithm.js';
import { TokenState } from '@unicitylabs/state-transition-sdk/lib/token/TokenState.js';
import type { Config } from './config.js';
import type { IdentityService } from './identity-service.js';
import type { PendingPayment } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

export class NostrService {
    private client: NostrClient | null = null;
    private keyManager: NostrKeyManager | null = null;
    private config: Config;
    private identityService: IdentityService;
    private pendingPayments: Map<string, PendingPayment> = new Map();
    private connected = false;

    constructor(config: Config, identityService: IdentityService) {
        this.config = config;
        this.identityService = identityService;
    }

    async connect(): Promise<void> {
        if (this.connected) return;

        const identity = this.identityService.getIdentity();
        const secretKey = Buffer.from(identity.privateKeyHex, 'hex');
        this.keyManager = NostrKeyManager.fromPrivateKey(secretKey);
        this.client = new NostrClient(this.keyManager);

        await this.client.connect(this.config.nostrRelayUrl);
        this.connected = true;

        // Subscribe to incoming token transfers (payments to us)
        this.subscribeToPayments();

        console.log(`[Nostr] Connected to: ${this.config.nostrRelayUrl}`);
        console.log(`[Nostr] MCP pubkey: ${this.keyManager.getPublicKeyHex()}`);
    }

    private subscribeToPayments(): void {
        if (!this.client || !this.keyManager) return;

        const myPubkey = this.keyManager.getPublicKeyHex();

        // Listen for token transfers addressed to us
        const filter = Filter.builder()
            .kinds(EventKinds.TOKEN_TRANSFER)
            .pTags(myPubkey)
            .build();

        this.client.subscribe(filter, {
            onEvent: (event: Event) => {
                this.handleIncomingTransfer(event).catch((err) => {
                    console.error('[Nostr] Error handling incoming transfer:', err);
                });
            },
        });

        console.log('[Nostr] Subscribed to incoming token transfers');
    }

    private async handleIncomingTransfer(event: Event): Promise<void> {
        if (!this.keyManager) return;

        try {
            // Check if this is a valid token transfer
            if (!TokenTransferProtocol.isTokenTransfer(event)) {
                return;
            }

            const senderPubkey = TokenTransferProtocol.getSender(event);
            const replyToEventId = TokenTransferProtocol.getReplyToEventId(event);

            console.log(`[Nostr] Received token transfer from ${senderPubkey.slice(0, 16)}... replyTo=${replyToEventId?.slice(0, 16) || 'none'}`);

            // Find matching pending payment
            let pending: PendingPayment | undefined;
            let pendingKey: string | undefined;

            // Match by replyToEventId (preferred)
            if (replyToEventId) {
                pending = this.pendingPayments.get(replyToEventId);
                if (pending) {
                    pendingKey = replyToEventId;
                    console.log(`[Nostr] Matched payment for ${pending.unicityId} via replyToEventId`);
                }
            }

            // Fallback: match by sender pubkey
            if (!pending) {
                for (const [key, p] of this.pendingPayments) {
                    if (p.userPubkey === senderPubkey) {
                        pending = p;
                        pendingKey = key;
                        console.log(`[Nostr] Matched payment for ${p.unicityId} via sender pubkey`);
                        break;
                    }
                }
            }

            if (!pending || !pendingKey) {
                console.log('[Nostr] No matching pending payment found for this transfer');
                return;
            }

            // Decrypt and process the token transfer
            console.log('[Nostr] Decrypting token transfer...');
            const tokenJson = await TokenTransferProtocol.parseTokenTransfer(
                event,
                this.keyManager
            );

            // Parse the transfer payload
            if (!tokenJson.startsWith('{') || !tokenJson.includes('sourceToken')) {
                console.error('[Nostr] Invalid token transfer format');
                pending.resolve(false);
                this.pendingPayments.delete(pendingKey);
                return;
            }

            let payloadObj: Record<string, any>;
            try {
                payloadObj = JSON.parse(tokenJson);
            } catch (error) {
                console.error('[Nostr] Failed to parse token JSON:', error);
                pending.resolve(false);
                this.pendingPayments.delete(pendingKey);
                return;
            }

            // Process and finalize the token
            const success = await this.processTokenTransfer(payloadObj);

            if (success) {
                console.log(`[Nostr] Payment confirmed and token received for ${pending.unicityId}!`);
                pending.resolve(true);
            } else {
                console.error(`[Nostr] Failed to process token for ${pending.unicityId}`);
                pending.resolve(false);
            }

            clearTimeout(pending.timeout);
            this.pendingPayments.delete(pendingKey);
        } catch (err) {
            console.error('[Nostr] Error processing transfer:', err);
        }
    }

    private async processTokenTransfer(payloadObj: Record<string, any>): Promise<boolean> {
        try {
            let sourceTokenInput = payloadObj['sourceToken'];
            let transferTxInput = payloadObj['transferTx'];

            // Parse if strings
            if (typeof sourceTokenInput === 'string') {
                sourceTokenInput = JSON.parse(sourceTokenInput);
            }
            if (typeof transferTxInput === 'string') {
                transferTxInput = JSON.parse(transferTxInput);
            }

            if (!sourceTokenInput || !transferTxInput) {
                console.error('[Nostr] Missing sourceToken or transferTx in payload');
                return false;
            }

            const sourceToken = await Token.fromJSON(sourceTokenInput);
            const transferTx = await TransferTransaction.fromJSON(transferTxInput);

            return await this.finalizeTransfer(sourceToken, transferTx);
        } catch (error) {
            console.error('[Nostr] Error processing token transfer:', error);
            return false;
        }
    }

    private async finalizeTransfer(
        sourceToken: Token<any>,
        transferTx: TransferTransaction
    ): Promise<boolean> {
        try {
            const recipientAddress = transferTx.data.recipient;
            const addressScheme = recipientAddress.scheme;

            console.log(`[Nostr] Recipient address scheme: ${addressScheme}`);

            if (addressScheme === AddressScheme.PROXY) {
                // Transfer to PROXY address (nametag) - needs finalization
                console.log('[Nostr] Transfer to PROXY address - finalizing...');

                const nametagToken = this.identityService.getNametagToken();
                if (!nametagToken) {
                    console.error('[Nostr] No nametag token available for finalization');
                    return false;
                }

                const signingService = this.identityService.getSigningService();
                const transferSalt = transferTx.data.salt;

                const recipientPredicate = await UnmaskedPredicate.create(
                    sourceToken.id,
                    sourceToken.type,
                    signingService,
                    HashAlgorithm.SHA256,
                    transferSalt
                );

                const recipientState = new TokenState(recipientPredicate, null);

                const client = this.identityService.getStateTransitionClient();
                const rootTrustBase = this.identityService.getRootTrustBase();

                const finalizedToken = await client.finalizeTransaction(
                    rootTrustBase,
                    sourceToken,
                    recipientState,
                    transferTx,
                    [nametagToken]
                );

                console.log('[Nostr] Token finalized successfully!');
                this.saveReceivedToken(finalizedToken);
                return true;
            } else {
                // Direct address - save without finalization
                console.log('[Nostr] Transfer to DIRECT address - saving...');
                this.saveReceivedToken(sourceToken);
                return true;
            }
        } catch (error) {
            console.error('[Nostr] Error finalizing transfer:', error);
            return false;
        }
    }

    private saveReceivedToken(token: Token<any>): void {
        try {
            const tokensDir = path.join(this.config.dataDir, 'tokens');
            if (!fs.existsSync(tokensDir)) {
                fs.mkdirSync(tokensDir, { recursive: true });
            }

            const tokenIdHex = Buffer.from(token.id.bytes).toString('hex').slice(0, 16);
            const filename = `token-${tokenIdHex}-${Date.now()}.json`;
            const tokenPath = path.join(tokensDir, filename);

            const tokenData = {
                token: token.toJSON(),
                receivedAt: Date.now(),
            };

            fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
            console.log(`[Nostr] Token saved to ${tokenPath}`);
        } catch (error) {
            console.error('[Nostr] Error saving token:', error);
        }
    }

    async resolvePubkey(unicityId: string): Promise<string | null> {
        if (!this.client) {
            throw new Error('Nostr client not connected');
        }
        const cleanId = unicityId.replace('@unicity', '').replace('@', '').trim();
        return this.client.queryPubkeyByNametag(cleanId);
    }

    async sendPaymentRequest(
        unicityId: string,
        userPubkey: string
    ): Promise<{ eventId: string; waitForPayment: () => Promise<boolean> }> {
        if (!this.client) {
            throw new Error('Nostr client not connected');
        }

        const eventId = await this.client.sendPaymentRequest(userPubkey, {
            amount: this.config.paymentAmount,
            coinId: this.config.paymentCoinId,
            recipientNametag: this.config.nametag,
            message: `Trivia day pass for @${unicityId}`,
        });

        console.log(`[Nostr] Sent payment request to ${unicityId} for amount ${this.config.paymentAmount} (eventId: ${eventId.slice(0, 16)}...)`);

        const waitForPayment = (): Promise<boolean> => {
            return new Promise((resolve) => {
                const pending: PendingPayment = {
                    eventId,
                    unicityId,
                    userPubkey,
                    resolve,
                    timeout: setTimeout(() => {
                        if (this.pendingPayments.has(eventId)) {
                            this.pendingPayments.delete(eventId);
                            resolve(false);
                        }
                    }, this.config.paymentTimeoutMs),
                };

                this.pendingPayments.set(eventId, pending);
            });
        };

        return { eventId, waitForPayment };
    }

    getPublicKey(): string {
        if (!this.keyManager) {
            throw new Error('Key manager not initialized');
        }
        return this.keyManager.getPublicKeyHex();
    }

    disconnect(): void {
        if (this.client) {
            this.client.disconnect();
        }
        this.connected = false;
    }
}
