import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import {
  parseMessage,
  encodeMessage,
  ACTION,
  type ChallengeMessage,
} from './protocol.js';
import { Game, type GameEndInfo } from './game.js';
import type { ChessBotConfig } from './config.js';
import { BotWallet } from './wallet.js';
import { StockfishEngine } from './stockfish.js';
import { rewardForElo } from './rewards.js';

const HANDLED_IDS_FILE = 'handled-game-ids.json';
// Keep at most this many recent IDs on disk. The bot's worst case is a
// historical replay storm right after restart — we just need enough IDs
// to cover the games we've accepted recently enough that the relay might
// still be replaying their CHALLENGE events. A few hundred easily covers
// days of activity.
const HANDLED_IDS_MAX = 500;

// Polyfill WebSocket for Node.js (required by sphere-sdk)
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as Record<string, unknown>).WebSocket = WebSocket;
}

export class ChessBot {
  private sphere: Sphere | null = null;
  private wallet: BotWallet | null = null;
  private engine: StockfishEngine | null = null;
  private games = new Map<string, Game>();
  private handledGameIds = new Set<string>();
  private handledGameIdsOrder: string[] = [];
  private handledGameIdsPath: string;
  private paidGameIds = new Set<string>();
  private tag: string;

  constructor(private config: ChessBotConfig) {
    this.tag = `[chess-bot:${config.nametag}]`;
    this.handledGameIdsPath = path.join(config.dataDir, HANDLED_IDS_FILE);
  }

  private loadHandledGameIds(): void {
    if (!fs.existsSync(this.handledGameIdsPath)) return;

    let raw: string;
    try {
      raw = fs.readFileSync(this.handledGameIdsPath, 'utf8');
    } catch (err) {
      console.error(`${this.tag} Failed to read handled gameIds:`, err);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // File exists but is unparseable — almost always a crash during a
      // previous write. Silently starting empty would re-arm the historical
      // replay leak this file is supposed to prevent. Move the corrupt
      // file aside (preserving it for inspection) and start fresh with a
      // very loud log so the operator notices.
      const aside = `${this.handledGameIdsPath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.handledGameIdsPath, aside);
      } catch {
        // Couldn't rename — at least don't read it again next boot.
        try { fs.unlinkSync(this.handledGameIdsPath); } catch { /* ignore */ }
      }
      console.error(
        `${this.tag} *** handled gameIds file was CORRUPT (${err}) — moved to ${aside}. Starting with empty set; historical CHALLENGE replays may be re-accepted until new games rebuild the list. ***`,
      );
      return;
    }

    if (!Array.isArray(parsed)) {
      console.error(`${this.tag} handled gameIds file is not an array; ignoring`);
      return;
    }

    for (const id of parsed) {
      if (typeof id === 'string') {
        this.handledGameIds.add(id);
        this.handledGameIdsOrder.push(id);
      }
    }
    console.log(`${this.tag} Loaded ${this.handledGameIds.size} handled gameIds from disk`);
  }

  /**
   * Record a gameId as handled. We only persist when `persist` is true —
   * i.e. for games we actually accepted and started. Declined challenges
   * stay in-memory only so a user whose challenge was rejected at-cap can
   * legitimately retry once the bot has freed a slot (and even survives
   * a bot restart, since the decline entry doesn't make it to disk).
   */
  private recordHandledGameId(gameId: string, persist: boolean): void {
    if (!this.handledGameIds.has(gameId)) {
      this.handledGameIds.add(gameId);
    }
    if (!persist) return;

    this.handledGameIdsOrder.push(gameId);
    while (this.handledGameIdsOrder.length > HANDLED_IDS_MAX) {
      const dropped = this.handledGameIdsOrder.shift();
      if (dropped) this.handledGameIds.delete(dropped);
    }
    // Atomic write: stage to <path>.tmp then rename. rename(2) is atomic on
    // POSIX filesystems, so a crash mid-write leaves the previous file
    // intact rather than a truncated/corrupt one — protects the protection.
    const tmp = `${this.handledGameIdsPath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.handledGameIdsPath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.handledGameIdsOrder), 'utf8');
      fs.renameSync(tmp, this.handledGameIdsPath);
    } catch (err) {
      console.error(`${this.tag} Failed to persist handled gameIds:`, err);
      // Best-effort cleanup of the temp file.
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  async start(): Promise<void> {
    console.log(`${this.tag} Starting...`);

    this.loadHandledGameIds();

    const providers = createNodeProviders({
      network: this.config.network as 'mainnet' | 'testnet',
      dataDir: this.config.dataDir,
      tokensDir: this.config.tokensDir,
    });

    const { sphere, created, generatedMnemonic } = await Sphere.init({
      ...providers,
      l1: null,
      autoGenerate: false,
      nametag: this.config.nametag,
      mnemonic: this.config.mnemonic,
      groupChat: !!this.config.groupId,
      // Short DM backfill window on startup. NIP-17 randomizes gift-wrap
      // created_at by up to ~2 days into the past, so we look back further
      // than "real" 1 hour to catch backdated wraps. We dedupe handled
      // gameIds via persistent state, so this only affects how much old DM
      // traffic the SDK pulls/decrypts on a fresh start.
      dmSince: Math.floor(Date.now() / 1000) - 3 * 3600,
    });

    this.sphere = sphere;

    if (created) {
      console.log(`${this.tag} Created new wallet`);
      if (generatedMnemonic) {
        console.log(`${this.tag} *** SAVE THIS MNEMONIC ***:`, generatedMnemonic);
      }
    } else {
      console.log(`${this.tag} Loaded existing wallet`);
    }

    const identity = sphere.identity;
    console.log(`${this.tag} Nametag: @${identity?.nametag}`);
    console.log(`${this.tag} Max concurrent games: ${this.config.maxConcurrentGames}`);

    // One Stockfish instance shared across all games — concurrent moves are serialized
    // by the engine's internal mutex. Avoids accumulating ASM.js heaps per-game.
    console.log(`${this.tag} Initializing shared Stockfish engine...`);
    this.engine = new StockfishEngine();
    await this.engine.init();
    console.log(`${this.tag} Stockfish ready`);

    // Initialize the reward wallet and ensure we have funds before accepting games.
    this.wallet = new BotWallet({
      sphere,
      nametag: identity?.nametag ?? this.config.nametag,
      coinSymbol: this.config.coinSymbol,
      faucetUrl: this.config.faucetUrl,
      targetBalance: this.config.targetBalance,
      minBalance: this.config.minBalance,
      tag: `${this.tag}[wallet]`,
    });

    this.wallet.ensureBalance().catch((err) =>
      console.error(`${this.tag} Initial balance check failed:`, err),
    );

    // Listen for incoming DMs. We rely on the SDK's per-event-id cache
    // (cacheMessages: true by default, persisted via autoSave) to dedupe
    // historical replays — applying a timestamp-based stale filter here
    // would either be redundant or, worse, falsely drop fresh DMs because
    // NIP-17's gift-wrap layer randomizes created_at by ±2 days.
    sphere.communications.onDirectMessage(async (message: {
      content: string;
      senderPubkey: string;
      senderNametag?: string;
    }) => {
      if (message.senderPubkey === identity?.chainPubkey) return;

      // Only respond to unichess: protocol messages, ignore everything else
      if (!message.content.trim().startsWith('unichess:')) return;

      const parsed = parseMessage(message.content);
      if (!parsed) return;

      try {
        if (parsed.action === ACTION.CHALLENGE) {
          await this.handleChallenge(
            parsed as ChallengeMessage,
            message.senderPubkey,
            message.senderNametag,
          );
        } else {
          const game = this.games.get(parsed.gameId);
          if (!game) {
            console.log(`${this.tag} No active game ${parsed.gameId}, ignoring ${parsed.action}`);
            return;
          }
          await game.handleMessage(parsed);
        }
      } catch (err) {
        console.error(`${this.tag} Error handling message:`, err);
      }
    });

    // Join group chat for posting game results
    if (this.config.groupId) {
      try {
        const groupChat = (sphere as any).groupChat;
        if (groupChat) {
          await groupChat.connect();
          try {
            await groupChat.joinGroup(this.config.groupId);
            console.log(`${this.tag} Joined group ${this.config.groupId}`);
          } catch {
            console.log(`${this.tag} Already in group or join not needed`);
          }
        }
      } catch (err) {
        console.error(`${this.tag} Group chat setup failed:`, err);
      }
    }

    console.log(`${this.tag} Ready — listening for challenges`);
  }

  private async handleChallenge(
    challenge: ChallengeMessage,
    senderPubkey: string,
    senderNametag?: string,
  ): Promise<void> {
    const label = senderNametag ? `@${senderNametag}` : senderPubkey.slice(0, 12) + '...';
    console.log(
      `${this.tag} Challenge from ${label}: game=${challenge.gameId} color=${challenge.color} time=${challenge.timeMinutes}min elo=${challenge.elo}`,
    );

    if (this.handledGameIds.has(challenge.gameId)) {
      console.log(`${this.tag} Game ${challenge.gameId} already handled, ignoring duplicate challenge`);
      return;
    }

    if (this.games.size >= this.config.maxConcurrentGames) {
      console.log(`${this.tag} Too many active games (${this.games.size}), declining`);
      // In-memory only — don't persist. The challenger's UI keeps retrying
      // this gameId while in 'awaiting-accept'; once we free up a slot
      // (possibly after a restart), the same retry should be eligible to
      // be accepted.
      this.recordHandledGameId(challenge.gameId, false);
      const noMsg = encodeMessage({ action: ACTION.DECLINE, gameId: challenge.gameId });
      await this.sendDM(senderPubkey, noMsg);
      // Resend in case the first DM is dropped — mirrors the ACCEPT path so
      // the challenger's UI reliably learns the bot declined.
      for (const delay of [2000, 5000]) {
        setTimeout(() => this.sendDM(senderPubkey, noMsg).catch(() => {}), delay);
      }
      return;
    }

    // Determine bot's color (challenger picks their own color)
    let myColor: 'w' | 'b';
    if (challenge.color === 'w') {
      myColor = 'b';
    } else if (challenge.color === 'b') {
      myColor = 'w';
    } else {
      myColor = Math.random() < 0.5 ? 'w' : 'b';
    }

    // Accept the challenge — send ok multiple times for reliability
    const okMsg = encodeMessage({ action: ACTION.ACCEPT, gameId: challenge.gameId });
    await this.sendDM(senderPubkey, okMsg);
    console.log(
      `${this.tag} Accepted game ${challenge.gameId} as ${myColor === 'w' ? 'white' : 'black'} (elo ${challenge.elo})`,
    );
    // Resend ok after short delays to increase delivery chance
    for (const delay of [2000, 5000]) {
      setTimeout(() => this.sendDM(senderPubkey, okMsg).catch(() => {}), delay);
    }

    if (!this.engine) {
      console.error(`${this.tag} Stockfish engine not ready — declining ${challenge.gameId}`);
      this.recordHandledGameId(challenge.gameId, false);
      const noMsg = encodeMessage({ action: ACTION.DECLINE, gameId: challenge.gameId });
      await this.sendDM(senderPubkey, noMsg);
      for (const delay of [2000, 5000]) {
        setTimeout(() => this.sendDM(senderPubkey, noMsg).catch(() => {}), delay);
      }
      return;
    }

    // Going forward we treat this as accepted — persist so a restart can't
    // re-accept the same gameId after the original game already ran.
    this.recordHandledGameId(challenge.gameId, true);

    // Create and start the game
    const botName = `@${this.sphere?.identity?.nametag ?? this.config.nametag}`;
    const whitePlayer = myColor === 'w' ? botName : label;
    const blackPlayer = myColor === 'b' ? botName : label;
    const game = new Game({
      gameId: challenge.gameId,
      myColor,
      timeControlMs: challenge.timeMinutes * 60 * 1000,
      elo: challenge.elo,
      engine: this.engine,
      sendMessage: (msg) => this.sendDM(senderPubkey, msg),
      whitePlayer,
      blackPlayer,
      whiteElo: myColor === 'w' ? challenge.elo : undefined,
      blackElo: myColor === 'b' ? challenge.elo : undefined,
      onGameEnd: (info) => {
        this.games.delete(info.gameId);
        console.log(`${this.tag} Game ${info.gameId} ended (${this.games.size} active)`);
        this.handleGameEnd(info, myColor, challenge.elo, senderPubkey, senderNametag).catch((err) =>
          console.error(`${this.tag} Post-game handling failed:`, err),
        );
        this.postGameResult(info, label, challenge.elo, myColor).catch((err) =>
          console.error(`${this.tag} Failed to post game result:`, err),
        );
      },
    });

    this.games.set(challenge.gameId, game);

    try {
      await game.start();
    } catch (err) {
      console.error(`${this.tag} Failed to start game ${challenge.gameId}:`, err);
      game.cleanup();
    }
  }

  private async handleGameEnd(
    info: GameEndInfo,
    botColor: 'w' | 'b',
    elo: number,
    opponentPubkey: string,
    opponentNametag: string | undefined,
  ): Promise<void> {
    if (!this.wallet) return;
    if (!info.result || info.result === 'd') return;
    if (info.result === botColor) return;
    if (this.paidGameIds.has(info.gameId)) return;
    this.paidGameIds.add(info.gameId);

    const reward = rewardForElo(elo);
    const recipient = opponentNametag ? `@${opponentNametag}` : opponentPubkey;
    console.log(
      `${this.tag} Bot lost game ${info.gameId} (elo ${elo}) — paying ${reward} ${this.config.coinSymbol} to ${recipient}`,
    );

    const result = await this.wallet.sendReward(
      recipient,
      reward,
      `unichess reward ${info.gameId}`,
    );
    if (!result.ok) {
      console.error(
        `${this.tag} Failed to pay reward for ${info.gameId}: ${result.error ?? 'unknown error'}`,
      );
      // Allow retry on a future game end if this one didn't go through.
      this.paidGameIds.delete(info.gameId);
    }

    // After paying out (or trying to), top up if we're now low.
    this.wallet.ensureBalance().catch((err) =>
      console.error(`${this.tag} Post-payout top-up failed:`, err),
    );
  }


  private async postGameResult(info: GameEndInfo, opponentLabel: string, elo: number, botColor: 'w' | 'b'): Promise<void> {
    if (!this.config.groupId || !this.sphere || !info.result) return;

    const botName = `@${this.sphere.identity?.nametag ?? this.config.nametag}`;
    const botSide = botColor === 'w' ? '♔' : '♚';
    const oppSide = botColor === 'w' ? '♚' : '♔';
    const white = botColor === 'w' ? `${botName} (ELO ${elo})` : opponentLabel;
    const black = botColor === 'b' ? `${botName} (ELO ${elo})` : opponentLabel;

    const outcome =
      info.result === 'd'
        ? `Draw by ${info.reason}`
        : info.result === botColor
          ? `${botName} wins by ${info.reason}`
          : `${opponentLabel} wins by ${info.reason}`;

    const lines = [
      `♟ ${botSide} ${white} vs ${oppSide} ${black}`,
      outcome,
      '',
      info.pgn || '(no moves)',
    ];

    try {
      const groupChat = (this.sphere as any).groupChat;
      if (groupChat) {
        await groupChat.sendMessage(this.config.groupId, lines.join('\n'));
        console.log(`${this.tag} Posted game result to group`);
      }
    } catch (err) {
      console.error(`${this.tag} Group message error:`, err);
    }
  }

  private async sendDM(pubkey: string, message: string): Promise<void> {
    if (!this.sphere) throw new Error('Bot not started');
    const short = message.length > 80 ? message.slice(0, 80) + '...' : message;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const start = Date.now();
        await this.sphere.communications.sendDM(pubkey, message);
        console.log(`${this.tag} DM sent (${Date.now() - start}ms, attempt ${attempt}): ${short}`);
        return;
      } catch (err) {
        console.error(`${this.tag} DM FAILED attempt ${attempt}/3: ${short} — ${err}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    console.error(`${this.tag} DM GAVE UP after 3 attempts: ${short}`);
  }

  async destroy(): Promise<void> {
    console.log(`${this.tag} Shutting down (${this.games.size} active games)...`);
    for (const game of this.games.values()) {
      game.cleanup();
    }
    this.games.clear();
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    if (this.sphere) {
      await this.sphere.destroy();
      this.sphere = null;
    }
    console.log(`${this.tag} Destroyed`);
  }
}
