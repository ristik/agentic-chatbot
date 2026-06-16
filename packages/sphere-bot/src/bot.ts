import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
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

    // Messaging-only bot: Nostr transport (DMs / group chat / nametag) plus the
    // oracle the v2 engine needs for the best-effort Unicity-ID mint inside
    // registerNametag. `network` is required on 0.9.x (testnet2) and the
    // aggregator apiKey must be injected. No wallet-api wrapper — this bot
    // never sends or receives tokens.
    const providers = createNodeProviders({
      network: this.config.network,
      dataDir: this.config.dataDir,
      tokensDir: this.config.tokensDir,
      oracle: {
        apiKey: process.env.AGGREGATOR_KEY || undefined,
        ...(this.config.oracle?.trustBasePath
          ? { trustBasePath: this.config.oracle.trustBasePath }
          : {}),
        debug: this.config.oracle?.debug,
      },
    });
    console.log(`${this.prefix} Providers created, calling Sphere.init()...`);

    const { sphere, created, generatedMnemonic } = await Sphere.init({
      ...providers,
      network: this.config.network, // required: Sphere.init forwards it to configure the TokenRegistry
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
