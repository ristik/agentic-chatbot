import { Sphere, toHumanReadable } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import type { IncomingTransfer } from '@unicitylabs/sphere-sdk';
import type { ModelMessage } from 'ai';
import type { SphereBotConfig } from './types.js';
import type { SphereBotAgent } from './agent.js';

export class SphereBot {
  private sphere: Sphere | null = null;
  private config: SphereBotConfig;
  private agent: SphereBotAgent;
  private conversations: Map<string, ModelMessage[]> = new Map();
  private prefix: string;

  constructor(config: SphereBotConfig, agent: SphereBotAgent) {
    this.config = config;
    this.agent = agent;
    this.prefix = `[Bot:${config.name}]`;
  }

  async start(): Promise<void> {
    console.log(`${this.prefix} Starting...`);
    console.log(`${this.prefix} Creating providers (network=${this.config.network}, dataDir=${this.config.dataDir})...`);

    const providers = createNodeProviders({
      network: this.config.network,
      dataDir: this.config.dataDir,
      tokensDir: this.config.tokensDir,
      ...(this.config.oracle ? {
        oracle: {
          trustBasePath: this.config.oracle.trustBasePath,
          debug: this.config.oracle.debug,
        },
      } : {}),
    });
    console.log(`${this.prefix} Providers created, calling Sphere.init()...`);

    const { sphere, created, generatedMnemonic } = await Sphere.init({
      ...providers,
      l1: null,
      autoGenerate: false,
      nametag: this.config.nametag,
      mnemonic: this.config.mnemonic,
      dmSince: Math.floor(Date.now() / 1000) - 86400,
      communications: { cacheMessages: this.config.cacheMessages ?? true },
    });
    console.log(`${this.prefix} Sphere.init() complete (created=${created})`);

    this.sphere = sphere;

    if (created) {
      console.log(`${this.prefix} Created new wallet`);
      if (generatedMnemonic) {
        console.log(`${this.prefix} WARNING: Back up this mnemonic:`, generatedMnemonic);
      }
    } else {
      console.log(`${this.prefix} Loaded existing wallet`);
    }

    // Always try to register nametag — ensures address_nametags binding exists in storage
    // (wallets created with older SDK versions may be missing this)
    if (this.config.nametag) {
      console.log(`${this.prefix} Ensuring nametag @${this.config.nametag} is registered...`);
      try {
        await sphere.registerNametag(this.config.nametag);
        console.log(`${this.prefix} Nametag registered successfully`);
      } catch (err: any) {
        console.log(`${this.prefix} registerNametag: ${err?.message ?? err}`);
      }
    }

    const identity = sphere.identity!;
    console.log(`${this.prefix} Nametag: @${identity.nametag ?? this.config.nametag}`);
    console.log(`${this.prefix} Direct address: ${identity.directAddress}`);
    console.log(`${this.prefix} Chain pubkey: ${identity.chainPubkey}`);

    // Listen for incoming DMs
    console.log(`${this.prefix} Registering DM listener...`);
    sphere.communications.onDirectMessage(async (message) => {
      const label = message.senderNametag ? `@${message.senderNametag}` : message.senderPubkey.slice(0, 12) + '...';
      console.log(`${this.prefix} DM received from ${label}: ${message.content.slice(0, 100)}`);

      // Ignore our own messages
      if (message.senderPubkey === identity.chainPubkey) {
        console.log(`${this.prefix} Ignoring own message`);
        return;
      }

      // Welcome trigger → respond with canned message, skip LLM
      if (this.config.welcomeTrigger && this.config.welcomeMessage
          && message.content === this.config.welcomeTrigger) {
        try {
          await sphere.communications.sendDM(message.senderPubkey, this.config.welcomeMessage);
          console.log(`${this.prefix} Sent welcome to ${label}`);
        } catch (error) {
          console.error(`${this.prefix} Failed to send welcome to ${label}:`, error);
        }
        return;
      }

      console.log(`${this.prefix} DM from ${message.senderNametag || message.senderPubkey.slice(0, 12)}...: ${message.content.slice(0, 100)}`);

      try {
        // Send composing indicators periodically while generating
        // Frontend typing timeout is 1.5s, so send every 1s to keep dots visible
        const sendComposing = () =>
          sphere.communications.sendComposingIndicator(message.senderPubkey).catch(() => {});
        await sendComposing();
        const composingInterval = setInterval(sendComposing, 1000);

        // Get conversation history
        const history = this.getHistory(message.senderPubkey);

        // Generate response
        let response: string;
        try {
          response = await this.agent.respond(message.content, history);
        } finally {
          clearInterval(composingInterval);
        }
        console.log(`${this.prefix} Response (${response.length} chars): ${response.slice(0, 200)}`);

        // Update history
        this.addToHistory(message.senderPubkey, 'user', message.content);
        this.addToHistory(message.senderPubkey, 'assistant', response);

        // Send response
        const sent = await sphere.communications.sendDM(message.senderPubkey, response);
        console.log(`${this.prefix} Replied to ${message.senderNametag || message.senderPubkey.slice(0, 12)}..., msgId=${sent.id}`);
      } catch (error) {
        console.error(`${this.prefix} Error handling DM:`, error);
        try {
          await sphere.communications.sendDM(
            message.senderPubkey,
            "Sorry, I encountered an error. Please try again."
          );
        } catch (sendError) {
          console.error(`${this.prefix} Failed to send error reply:`, sendError);
        }
      }
    });

    console.log(`${this.prefix} Listening for DMs`);

    // Token transfer handling (opt-in via tokenTransferPrompt)
    if (this.config.tokenTransferPrompt) {
      this.setupTokenTransferListeners(sphere);
    }
  }

  private setupTokenTransferListeners(sphere: Sphere): void {
    const identity = sphere.identity!;

    // 1) Listen for VALID transfers (after SDK validation + finalization)
    sphere.on('transfer:incoming', (transfer: IncomingTransfer) => {
      if (transfer.senderPubkey === identity.chainPubkey) return;

      const tokenSummaries = transfer.tokens.map(t => {
        const human = toHumanReadable(t.amount, t.decimals);
        return `${human} ${t.symbol} (${t.name})`;
      }).join(', ');

      const senderLabel = transfer.senderNametag
        ? `@${transfer.senderNametag}`
        : transfer.senderPubkey.slice(0, 16) + '...';

      console.log(`${this.prefix} Valid token transfer from ${senderLabel}: ${tokenSummaries}`);

      const context = [
        `TOKEN TRANSFER RECEIVED (valid)`,
        `From: ${senderLabel}`,
        `Tokens: ${tokenSummaries}`,
        transfer.memo ? `Memo: ${transfer.memo}` : null,
      ].filter(Boolean).join('\n');

      this.handleTransferReply(sphere, transfer.senderPubkey, context).catch(err =>
        console.error(`${this.prefix} Error replying to valid transfer:`, err)
      );
    });

    console.log(`${this.prefix} Listening for token transfers`);
  }

  private async handleTransferReply(sphere: Sphere, senderPubkey: string, transferContext: string): Promise<void> {
    const transferPrompt = this.config.tokenTransferPrompt!;

    const sendComposing = () =>
      sphere.communications.sendComposingIndicator(senderPubkey).catch(() => {});
    await sendComposing();
    const composingInterval = setInterval(sendComposing, 1000);

    const history = this.getHistory(senderPubkey);

    let response: string;
    try {
      response = await this.agent.respondToTransfer(transferPrompt, transferContext, history);
    } finally {
      clearInterval(composingInterval);
    }

    console.log(`${this.prefix} Transfer response (${response.length} chars): ${response.slice(0, 200)}`);

    // Store in conversation history so future DMs have context
    this.addToHistory(senderPubkey, 'user', `[Token transfer: ${transferContext}]`);
    this.addToHistory(senderPubkey, 'assistant', response);

    const sent = await sphere.communications.sendDM(senderPubkey, response);
    console.log(`${this.prefix} Sent transfer reply, msgId=${sent.id}`);
  }

  async destroy(): Promise<void> {
    if (this.sphere) {
      await this.sphere.destroy();
      this.sphere = null;
      console.log(`${this.prefix} Destroyed`);
    }
  }

  private getHistory(pubkey: string): ModelMessage[] {
    return this.conversations.get(pubkey) || [];
  }

  private addToHistory(pubkey: string, role: 'user' | 'assistant', content: string): void {
    if (!this.conversations.has(pubkey)) {
      this.conversations.set(pubkey, []);
    }

    const history = this.conversations.get(pubkey)!;
    history.push({ role, content });

    // Trim to max history (each pair = 2 entries)
    const maxEntries = this.config.maxHistoryMessages * 2;
    if (history.length > maxEntries) {
      history.splice(0, history.length - maxEntries);
    }
  }
}
