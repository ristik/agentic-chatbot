import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';
import { Sphere, STORAGE_KEYS_GLOBAL } from '@unicitylabs/sphere-sdk';
import { createNodeProviders, createFileStorageProvider } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
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

/**
 * Drop incoming DMs whose ROOM rumor timestamp is older than this. The SDK
 * delivers `message.timestamp = pm.timestamp * 1000` where pm.timestamp is
 * the inner NIP-17 rumor's `created_at` (the sender's actual wall-clock
 * time at send — NIP-17 only randomizes the outer seal/wrap, not the
 * rumor). So this filter does correctly distinguish fresh from historical.
 *
 * Why we need it: even with our `filter.since = now` reconnect dance, the
 * relay still streams ~50% of historical gift wraps because their outer
 * created_at was randomized into the future half of the ±2d window. We
 * decrypt them (we can't avoid that — the SDK doesn't dedupe by event id
 * before decryption) and then drop them here.
 *
 * Threshold sized generously: chess UI's CHALLENGE_TIMEOUT_MS is 5 min, so
 * any user still actively retrying has been waiting < 5 min. 10 min gives
 * a comfortable margin for relay propagation lag and clock skew on top.
 */
const MAX_INCOMING_DM_AGE_MS = 600_000;

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
  /**
   * Set true once drain() has begun. New PINGs and CHALLENGEs are
   * declined while this is set; existing games continue to play out
   * normally. Existing protocol semantics already cover the "bot is
   * busy" case via DECLINE, so the UI side requires no new logic.
   */
  private shuttingDown = false;
  /**
   * Outstanding post-game work (reward payouts, group-result posts).
   * Tracked so drain() can wait for them to settle before tearing down
   * Sphere — otherwise a Sphere transfer in flight gets cancelled and
   * the opponent never receives their reward.
   */
  private pendingShutdownTasks = new Set<Promise<unknown>>();

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

  /**
   * Wipe the SDK's persisted DM cursor so every startup looks like a fresh
   * one. Without this, the SDK resumes from the stored `last_dm_event_ts`
   * and the relay subscription queries `(stored - 2 days)` due to NIP-17
   * randomization — i.e. ~2 days of historical kind:1059 events get
   * decrypted on every restart. We want startup to be fast on every boot
   * (we accept the ~50% per-DM dropout for fresh DMs; the chess protocol
   * retries every 5s so end-to-end loss is negligible).
   */
  private async clearDmCursor(): Promise<void> {
    try {
      const tempStorage = createFileStorageProvider({ dataDir: this.config.dataDir });
      await tempStorage.connect();
      // Stored key shape: `${LAST_DM_EVENT_TS}_${nostrPubkey.slice(0,16)}`.
      // Prefix-match catches the per-pubkey suffix.
      const keys = await tempStorage.keys(STORAGE_KEYS_GLOBAL.LAST_DM_EVENT_TS);
      for (const key of keys) {
        await tempStorage.remove(key);
      }
      await tempStorage.disconnect();
      if (keys.length > 0) {
        console.log(`${this.tag} Cleared ${keys.length} stored DM cursor key(s) so backfill starts at "now"`);
      }
    } catch (err) {
      console.error(`${this.tag} Failed to clear DM cursor — startup may be slow:`, err);
    }
  }

  async start(): Promise<void> {
    console.log(`${this.tag} Starting...`);

    this.loadHandledGameIds();
    await this.clearDmCursor();

    // Base bundle: Nostr transport (messaging / group chat / nametag), oracle
    // (aggregator + trustbase + apiKey) and storage. On the 0.9.x line `network`
    // is required (testnet2) and the aggregator apiKey must be injected.
    const base = createNodeProviders({
      network: 'testnet2',
      dataDir: this.config.dataDir,
      tokensDir: this.config.tokensDir,
      oracle: { apiKey: process.env.AGGREGATOR_KEY || undefined },
    });

    // Wrap with the FULL wallet-api preset: this bot moves money (reward
    // payouts), so assets ride the wallet-api mailbox (deposit→claim) with
    // server inventory custody; messaging stays on Nostr. deviceId MUST be
    // stable across restarts — it persists the rotating refresh token. Node
    // >= 22 provides a global WebSocket/fetch, so no factory is needed.
    // Fail-closed: omitting the walletApi client throws INVALID_CONFIG.
    const providers = createWalletApiProviders(base, {
      baseUrl: process.env.WALLET_API_URL!,
      network: 'testnet2',
      deviceId: process.env.WALLET_API_DEVICE_ID,
    });

    // We pass dmSince to skip the 2-day NIP-17 backfill (the SDK subtracts
    // 2d for jitter compensation, so feeding `now + 2d` makes filter.since
    // land at `now`). Today the SDK applies this AFTER subscribing, so it
    // doesn't take effect on the first startup; persistent storage of
    // last_dm_event_ts (which we clear in clearDmCursor) is what actually
    // sticks. The rumor-timestamp filter in the message handler below is
    // the load-bearing protection against historical replays — see
    // MAX_INCOMING_DM_AGE_MS.
    const futureDmSince = Math.floor(Date.now() / 1000) + 2 * 86400;

    const { sphere, created, generatedMnemonic } = await Sphere.init({
      ...providers,
      network: 'testnet2', // required: Sphere.init forwards it to configure the TokenRegistry
      l1: null,
      autoGenerate: false,
      nametag: this.config.nametag,
      mnemonic: this.config.mnemonic,
      groupChat: !!this.config.groupId,
      dmSince: futureDmSince,
      communications: { cacheMessages: false },
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
      targetBalance: this.config.targetBalance,
      minBalance: this.config.minBalance,
      tag: `${this.tag}[wallet]`,
    });

    this.wallet.ensureBalance().catch((err) =>
      console.error(`${this.tag} Initial balance check failed:`, err),
    );

    // Listen for incoming DMs.
    let staleDropCount = 0;
    let lastStaleLogAt = 0;
    sphere.communications.onDirectMessage(async (message: {
      content: string;
      senderPubkey: string;
      senderNametag?: string;
      timestamp: number;
    }) => {
      if (message.senderPubkey === identity?.chainPubkey) return;

      // Only respond to unichess: protocol messages, ignore everything else
      if (!message.content.trim().startsWith('unichess:')) return;

      // Drop stale DMs based on the rumor timestamp. See MAX_INCOMING_DM_AGE_MS.
      const ageMs = Date.now() - message.timestamp;
      if (ageMs > MAX_INCOMING_DM_AGE_MS) {
        staleDropCount++;
        const now = Date.now();
        if (now - lastStaleLogAt > 5_000) {
          console.log(
            `${this.tag} Dropped ${staleDropCount} stale DM(s); newest ${Math.round(ageMs / 1000)}s old`,
          );
          staleDropCount = 0;
          lastStaleLogAt = now;
        }
        return;
      }

      const parsed = parseMessage(message.content);
      if (!parsed) return;

      try {
        if (parsed.action === ACTION.PING) {
          await this.handlePing(parsed.gameId, message.senderPubkey, message.senderNametag);
        } else if (parsed.action === ACTION.CHALLENGE) {
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
          // Leave any group we got auto-joined to (e.g. general,
          // announcements) — those member lists can be 50k+ each and bloat
          // wallet.json to 16MB+ on every startup. Bot only needs its one
          // configured group for posting results.
          try {
            const joined: Array<{ id: string }> = groupChat.getGroups?.() ?? [];
            const unwanted = joined.filter((g) => g.id !== this.config.groupId);
            for (const g of unwanted) {
              try {
                await groupChat.leaveGroup(g.id);
                console.log(`${this.tag} Left unwanted group ${g.id}`);
              } catch (err) {
                console.warn(`${this.tag} Failed to leave group ${g.id}:`, err);
              }
            }
          } catch (err) {
            console.warn(`${this.tag} Failed to enumerate joined groups:`, err);
          }
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

  /**
   * Liveness probe handler. The chess UI sends PING before requesting a
   * deposit so it can fail fast if the bot is unreachable or full.
   *
   * Reply policy:
   *  - PONG if we can accept a new game right now (cap has room, engine
   *    ready). The UI then proceeds with deposit + CHALLENGE.
   *  - DECLINE if we're at capacity or engine not ready. The UI surfaces
   *    a "bot is busy" notice and skips the deposit.
   *
   * No state changes here — pings don't reserve a slot, don't add to
   * handledGameIds, don't pre-allocate anything. The actual reservation
   * happens in handleChallenge when the deposited challenge arrives. There
   * is a small race where a slot could be taken between PONG and the
   * CHALLENGE, but the cap re-check in handleChallenge catches that and
   * the UI's existing DECLINE handling refunds the deposit.
   */
  private async handlePing(
    gameId: string,
    senderPubkey: string,
    senderNametag?: string,
  ): Promise<void> {
    const label = senderNametag ? `@${senderNametag}` : senderPubkey.slice(0, 12) + '...';
    const atCap = this.games.size >= this.config.maxConcurrentGames;
    const engineReady = !!this.engine;
    const canAccept = !this.shuttingDown && !atCap && engineReady;
    const reply = canAccept ? ACTION.PONG : ACTION.DECLINE;
    const reason = this.shuttingDown
      ? 'shutting down'
      : atCap
        ? 'at cap'
        : 'engine not ready';
    console.log(
      `${this.tag} PING from ${label} for ${gameId} — ${canAccept ? 'PONG' : `DECLINE (${reason})`}`,
    );
    await this.sendDM(senderPubkey, encodeMessage({ action: reply, gameId }));
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

    if (this.shuttingDown) {
      console.log(`${this.tag} Shutting down — declining challenge ${challenge.gameId}`);
      // In-memory only, like the at-cap path: once we're back up the same
      // gameId should be eligible (in fact more likely — see comment below).
      this.recordHandledGameId(challenge.gameId, false);
      const noMsg = encodeMessage({ action: ACTION.DECLINE, gameId: challenge.gameId });
      await this.sendDM(senderPubkey, noMsg);
      for (const delay of [2000, 5000]) {
        setTimeout(() => this.sendDM(senderPubkey, noMsg).catch(() => {}), delay);
      }
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
        this.trackShutdownTask(
          this.handleGameEnd(info, myColor, challenge.elo, senderPubkey, senderNametag).catch((err) =>
            console.error(`${this.tag} Post-game handling failed:`, err),
          ),
        );
        this.trackShutdownTask(
          this.postGameResult(info, label, challenge.elo, myColor).catch((err) =>
            console.error(`${this.tag} Failed to post game result:`, err),
          ),
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

  /**
   * Register a post-game async task (reward payout, group post, etc.) so
   * drain() can wait for it to settle before tearing down Sphere. The
   * task is auto-removed once it resolves/rejects.
   */
  private trackShutdownTask(task: Promise<unknown>): void {
    this.pendingShutdownTasks.add(task);
    task.finally(() => this.pendingShutdownTasks.delete(task));
  }

  /**
   * Graceful shutdown:
   *   1. Decline new pings / challenges (shuttingDown flag).
   *   2. Wait up to `shutdownGraceMs` for active games to finish naturally.
   *   3. Force-resign anything still active. Opponents win by resign and
   *      the normal payout path fires — they get their reward, not a
   *      disconnect-claim hassle.
   *   4. Wait up to `shutdownPayoutWaitMs` for in-flight reward transfers
   *      and group posts to settle.
   *   5. Tear down (destroy).
   *
   * Idempotent: a second drain() while already shutting down skips
   * straight to destroy().
   */
  async drain(): Promise<void> {
    if (this.shuttingDown) {
      console.log(`${this.tag} drain() called twice — forcing destroy`);
      await this.destroy();
      return;
    }
    this.shuttingDown = true;
    const graceMs = this.config.shutdownGraceMs;
    const payoutWaitMs = this.config.shutdownPayoutWaitMs;
    const startedAt = Date.now();
    const initialActive = this.games.size;
    console.log(
      `${this.tag} Draining: stopped accepting new games. ${initialActive} active; grace=${Math.round(graceMs / 1000)}s, payout-wait=${Math.round(payoutWaitMs / 1000)}s`,
    );

    // Phase 1: let games finish naturally
    while (this.games.size > 0 && Date.now() - startedAt < graceMs) {
      await new Promise((r) => setTimeout(r, 2_000));
    }

    // Phase 2: force-resign anything still in progress so opponents get
    // their reward instead of being abandoned mid-game.
    if (this.games.size > 0) {
      const remaining = [...this.games.values()];
      console.log(
        `${this.tag} Grace expired — resigning ${remaining.length} active game(s) and paying out`,
      );
      await Promise.allSettled(remaining.map((g) => g.forceResign()));
    } else {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      console.log(`${this.tag} All games finished naturally in ${elapsed}s`);
    }

    // Phase 3: wait for reward payouts and group posts to settle
    if (this.pendingShutdownTasks.size > 0) {
      console.log(
        `${this.tag} Waiting up to ${Math.round(payoutWaitMs / 1000)}s for ${this.pendingShutdownTasks.size} post-game task(s) to settle`,
      );
      await Promise.race([
        Promise.allSettled([...this.pendingShutdownTasks]),
        new Promise((r) => setTimeout(r, payoutWaitMs)),
      ]);
      if (this.pendingShutdownTasks.size > 0) {
        console.warn(
          `${this.tag} ${this.pendingShutdownTasks.size} post-game task(s) still pending after payout wait — exiting anyway`,
        );
      }
    }

    await this.destroy();
  }

  /**
   * Hard shutdown. Use drain() for graceful behavior; this is the force
   * path that abandons any in-progress games via game.cleanup().
   */
  async destroy(): Promise<void> {
    console.log(`${this.tag} Tearing down (${this.games.size} active games)...`);
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
