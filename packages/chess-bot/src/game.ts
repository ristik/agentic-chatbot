import { Chess } from 'chess.js';
import { StockfishEngine } from './stockfish.js';
import {
  encodeMessage,
  ACTION,
  type ParsedMessage,
  type GameOverResult,
  type GameOverReason,
} from './protocol.js';

const POLL_INTERVAL_MS = 5_000;
/**
 * Silence threshold used once we've confirmed the opponent is a heartbeat-
 * capable client (UI sends `hb` every 5s while it's the user's turn). Six
 * missed heartbeats means they're really gone.
 */
const OPPONENT_SILENCE_WITH_HB_MS = 30_000;
/** Grace period added to opponent's clock when they don't send heartbeats. */
const OPPONENT_SILENCE_GRACE_MS = 30_000;

export interface GameEndInfo {
  gameId: string;
  result: GameOverResult | null;
  reason: GameOverReason | null;
  pgn: string;
}

export interface GameOptions {
  gameId: string;
  myColor: 'w' | 'b';
  timeControlMs: number;
  elo: number;
  /** Shared engine owned by the bot — initialized once, reused across games. */
  engine: StockfishEngine;
  sendMessage: (msg: string) => Promise<void>;
  onGameEnd: (info: GameEndInfo) => void;
  /** Display name for the white player in the PGN header (default: "White"). */
  whitePlayer?: string;
  /** Display name for the black player in the PGN header (default: "Black"). */
  blackPlayer?: string;
  /** Optional ELO ratings for the PGN headers. */
  whiteElo?: number;
  blackElo?: number;
  /** PGN Event tag (default: "Unicity Chess"). */
  event?: string;
  /** PGN Site tag (default: "https://sphere.unicity.network"). */
  site?: string;
  /** PGN Round tag (default: "-"). */
  round?: string;
}

export class Game {
  readonly gameId: string;
  readonly myColor: 'w' | 'b';
  readonly elo: number;

  private chess: Chess;
  private engine: StockfishEngine;
  private myClockMs: number;
  private opponentClockMs: number;
  private turnStartedAt = 0;
  private moveCount = 0;
  private lastAppliedOpponentMoveNum = 0;
  private pollInterval?: ReturnType<typeof setInterval>;
  private pollCount = 0;
  private lastMoveSent: { san: string; color: 'w' | 'b'; moveNum: number } | null = null;
  private ended = false;
  private lastOpponentActivity = 0;
  /**
   * True once we've received any hb DM from the opponent — confirms they're
   * running a UI version that sends heartbeats while it's their turn, so we
   * can apply a much shorter silence threshold. Old UIs never trip this and
   * fall back to a clock-based threshold for backwards compatibility.
   */
  private seenOpponentHeartbeat = false;
  private timeControlMs: number;
  private sendMessage: (msg: string) => Promise<void>;
  private onGameEnd: (info: GameEndInfo) => void;
  private tag: string;

  constructor(options: GameOptions) {
    this.gameId = options.gameId;
    this.myColor = options.myColor;
    this.elo = options.elo;
    this.chess = new Chess();
    this.engine = options.engine;
    this.myClockMs = options.timeControlMs;
    this.opponentClockMs = options.timeControlMs;
    this.sendMessage = options.sendMessage;
    this.onGameEnd = options.onGameEnd;
    this.timeControlMs = options.timeControlMs;
    this.lastOpponentActivity = Date.now();
    this.tag = `[game:${options.gameId}]`;
    this.initPgnHeaders(options);
  }

  private initPgnHeaders(opts: GameOptions): void {
    const now = new Date();
    const date = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}`;
    this.chess.setHeader('Event', opts.event ?? 'Unicity Chess');
    this.chess.setHeader('Site', opts.site ?? 'https://sphere.unicity.network');
    this.chess.setHeader('Date', date);
    this.chess.setHeader('Round', opts.round ?? '-');
    this.chess.setHeader('White', opts.whitePlayer ?? 'White');
    this.chess.setHeader('Black', opts.blackPlayer ?? 'Black');
    if (opts.whiteElo != null) this.chess.setHeader('WhiteElo', String(opts.whiteElo));
    if (opts.blackElo != null) this.chess.setHeader('BlackElo', String(opts.blackElo));
    this.chess.setHeader('Result', '*');
    this.chess.setHeader('TimeControl', String(Math.floor(opts.timeControlMs / 1000)));
  }

  private log(msg: string): void {
    console.log(`${this.tag} ${msg}`);
  }

  async start(): Promise<void> {
    this.log(`START color=${this.myColor} elo=${this.elo} time=${this.timeControlMs}ms`);

    if (this.myColor === 'w') {
      this.log('Playing white — making first move after 1.5s delay');
      await sleep(1500);
      this.turnStartedAt = Date.now();
      await this.makeMove();
    } else {
      this.log('Playing black — waiting for opponent first move');
      this.startPolling();
    }
  }

  async handleMessage(msg: ParsedMessage): Promise<void> {
    if (this.ended) {
      this.log(`IGNORED ${msg.action} (game ended)`);
      return;
    }

    switch (msg.action) {
      case ACTION.MOVE: {
        if (msg.color === this.myColor) {
          this.log(`IGNORED mv — color ${msg.color} is ours (echo?)`);
          return;
        }
        if (msg.moveNum > 0 && msg.moveNum <= this.lastAppliedOpponentMoveNum) {
          // Opponent resent an old move — they didn't get our reply. Resend immediately.
          if (this.lastMoveSent) {
            this.log(`RECV stale mv #${msg.moveNum} — opponent missed our #${this.lastMoveSent.moveNum}, resending now`);
            this.sendMessage(this.buildMoveMsg()).catch(() => {});
          }
          return;
        }
        this.lastOpponentActivity = Date.now();
        await this.handleOpponentMove(msg.san, msg.clockMs, msg.moveNum);
        break;
      }
      case ACTION.HEARTBEAT:
        this.lastOpponentActivity = Date.now();
        this.opponentClockMs = msg.clockMs;
        this.seenOpponentHeartbeat = true;
        break;
      case ACTION.RESIGN:
        this.log('RECV resign');
        await this.endGame(this.myColor, 'resign');
        break;
      case ACTION.DRAW_OFFER:
        this.log('RECV draw offer — declining');
        this.sendMessage(
          encodeMessage({ action: ACTION.DRAW_DECLINE, gameId: this.gameId }),
        ).catch(() => {});
        break;
      case ACTION.ABORT:
        if (this.moveCount < 2) {
          this.log('RECV abort');
          this.cleanup();
        }
        break;
      case ACTION.GAMEOVER: {
        this.log(`RECV gameover ${msg.result} by ${msg.reason}`);
        // Opponent claiming a draw or their own loss is safe to trust — bot
        // owes no reward either way and we want the post-game routine (group
        // post) to run. If they claim they won, only honor it when local
        // state agrees, else an opponent could fake a checkmate to extract a
        // reward from the bot.
        const opponentClaimsBotLost =
          msg.result !== 'd' && msg.result !== this.myColor;
        if (opponentClaimsBotLost && !this.verifyOpponentBotLossClaim(msg.reason)) {
          this.log(
            `REJECTED opponent gameover ${msg.result} by ${msg.reason} — local state disagrees`,
          );
          this.cleanup();
          break;
        }
        await this.endGame(msg.result, msg.reason);
        break;
      }
      default:
        this.log(`IGNORED unknown action: ${msg.action}`);
        break;
    }
  }

  private async handleOpponentMove(san: string, clockMs: number, moveNum: number): Promise<void> {
    this.stopPolling();
    this.opponentClockMs = clockMs;

    try {
      this.chess.move(san);
    } catch {
      this.log(`INVALID opponent move: ${san} — ignoring, resuming poll`);
      // Don't clear lastMoveSent — we still want resends of our pending move.
      // Restart polling so the disconnect timer can still evict this game.
      this.startPolling();
      return;
    }

    this.lastMoveSent = null;

    this.moveCount++;
    this.lastAppliedOpponentMoveNum = moveNum;
    this.log(`RECV mv ${san} #${moveNum} (opponent clock: ${clockMs}ms) — total moves: ${this.moveCount}`);

    if (this.checkTerminal()) return;

    this.log('Thinking...');
    this.turnStartedAt = Date.now();
    await this.makeMove();
  }

  private async makeMove(): Promise<void> {
    if (this.ended) return;
    if (!this.turnStartedAt) this.turnStartedAt = Date.now();

    const thinkTime = this.calculateThinkTime();
    this.log(`Stockfish go movetime=${thinkTime}ms (my clock: ${Math.round(this.myClockMs)}ms)`);

    let uciMove: string;
    try {
      uciMove = await this.engine.getBestMove({
        fen: this.chess.fen(),
        thinkTimeMs: thinkTime,
        elo: this.elo,
        gameId: this.gameId,
      });
    } catch (err) {
      this.log(`STOCKFISH ERROR: ${err} — resigning`);
      this.sendMessage(
        encodeMessage({ action: ACTION.RESIGN, gameId: this.gameId }),
      ).catch(() => {});
      this.cleanup();
      return;
    }

    if (this.ended) return;

    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

    let san: string;
    try {
      const move = this.chess.move({ from, to, promotion });
      san = move.san;
    } catch {
      this.log(`CANNOT APPLY Stockfish move ${uciMove} — resigning`);
      this.sendMessage(
        encodeMessage({ action: ACTION.RESIGN, gameId: this.gameId }),
      ).catch(() => {});
      this.cleanup();
      return;
    }

    const elapsed = Date.now() - this.turnStartedAt;
    this.myClockMs -= elapsed;
    this.turnStartedAt = 0;
    this.moveCount++;

    if (this.myClockMs <= 0) {
      this.myClockMs = 0;
      this.log('BOT TIMED OUT');
      const winner = this.myColor === 'w' ? 'b' : 'w';
      await this.endGame(winner as GameOverResult, 'timeout');
      return;
    }

    this.lastMoveSent = { san, color: this.myColor, moveNum: this.moveCount };
    const moveMsg = this.buildMoveMsg();
    this.log(`SEND mv ${san} #${this.moveCount} (my clock: ${Math.round(this.myClockMs)}ms, thought: ${elapsed}ms)`);
    this.sendMessage(moveMsg).catch((err) => this.log(`SEND FAILED: ${err}`));

    if (this.checkTerminal()) return;

    this.log('Waiting for opponent — starting poll');
    this.startPolling();
  }

  private verifyOpponentBotLossClaim(reason: GameOverReason): boolean {
    // Only checkmate is independently verifiable from the chess position.
    // timeout/resign/disconnect/agreement: the bot would have authored these
    // itself if they were true (own clock, own RESIGN, own poll, own draw
    // accept). Draw reasons (stalemate/repetition/material/50move) contradict
    // a non-draw result.
    return reason === 'checkmate' && this.chess.isCheckmate();
  }

  private checkTerminal(): boolean {
    if (this.chess.isCheckmate()) {
      const loser = this.chess.turn();
      const winner = (loser === 'w' ? 'b' : 'w') as GameOverResult;
      this.log(`CHECKMATE — ${winner} wins`);
      this.endGame(winner, 'checkmate');
      return true;
    }
    if (this.chess.isStalemate()) {
      this.log('STALEMATE');
      this.endGame('d', 'stalemate');
      return true;
    }
    if (this.chess.isThreefoldRepetition()) {
      this.log('THREEFOLD REPETITION');
      this.endGame('d', 'repetition');
      return true;
    }
    if (this.chess.isInsufficientMaterial()) {
      this.log('INSUFFICIENT MATERIAL');
      this.endGame('d', 'material');
      return true;
    }
    if (this.chess.isDraw()) {
      this.log('50-MOVE DRAW');
      this.endGame('d', '50move');
      return true;
    }
    return false;
  }

  private async endGame(result: GameOverResult, reason: GameOverReason): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.stopPolling();

    const pgnResult = result === 'w' ? '1-0' : result === 'b' ? '0-1' : '1/2-1/2';
    this.chess.setHeader('Result', pgnResult);
    this.chess.setHeader('Termination', reason);

    const outcome =
      result === 'd'
        ? 'DRAW'
        : result === this.myColor
          ? 'BOT WINS'
          : 'OPPONENT WINS';
    this.log(`GAME OVER: ${outcome} by ${reason} | moves: ${this.moveCount} | pgn: ${this.chess.pgn()}`);

    this.sendMessage(
      encodeMessage({ action: ACTION.GAMEOVER, gameId: this.gameId, result, reason }),
    ).catch((err) => this.log(`Failed to send gameover: ${err}`));

    this.sendMessage('gg').catch(() => {});

    this.onGameEnd({ gameId: this.gameId, result, reason, pgn: this.chess.pgn() });
  }

  private buildMoveMsg(): string {
    const m = this.lastMoveSent!;
    return encodeMessage({
      action: ACTION.MOVE,
      gameId: this.gameId,
      san: m.san,
      clockMs: Math.max(0, Math.round(this.myClockMs)),
      color: m.color,
      moveNum: m.moveNum,
      // Stamp every send (including poll resends) so receivers can subtract
      // Nostr transit delay from the displayed bot clock. The bot's own
      // myClockMs is frozen while it's the opponent's turn, so restamping
      // on resend is correct: sentAtMs is "when this snapshot is current".
      sentAtMs: Date.now(),
    });
  }

  private calculateThinkTime(): number {
    let thinkTime = Math.floor(this.myClockMs / 40);
    thinkTime = Math.max(200, thinkTime);
    thinkTime = Math.min(10_000, thinkTime);
    thinkTime = Math.min(thinkTime, this.myClockMs - 2000);
    return Math.max(100, thinkTime);
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollCount = 0;
    this.log(`POLL START — will resend every ${POLL_INTERVAL_MS / 1000}s, lastMoveSent=${this.lastMoveSent ? this.lastMoveSent.san + ' #' + this.lastMoveSent.moveNum : 'null'}`);
    this.pollInterval = setInterval(() => {
      if (this.ended) return;
      this.pollCount++;

      const silenceMs = Date.now() - this.lastOpponentActivity;
      const silenceSec = Math.round(silenceMs / 1000);

      // New UIs send hb every 5s while it's the user's turn, so a 30s
      // silence threshold catches disconnects fast without false-kicking
      // a deep-thinking player. Old UIs (no hb) fall back to clock-based
      // eviction: once the opponent's own clock would be exhausted, they
      // must have either timed out or disconnected.
      const silenceLimitMs = this.seenOpponentHeartbeat
        ? OPPONENT_SILENCE_WITH_HB_MS
        : this.opponentClockMs + OPPONENT_SILENCE_GRACE_MS;

      if (silenceMs >= silenceLimitMs) {
        this.log(
          `OPPONENT DISCONNECTED — ${silenceSec}s silence > ${Math.round(silenceLimitMs / 1000)}s limit (${this.seenOpponentHeartbeat ? 'hb' : 'no-hb fallback'})`,
        );
        this.endGame(this.myColor as GameOverResult, 'disconnect').catch(() => {});
        return;
      }

      if (this.lastMoveSent) {
        const msg = this.buildMoveMsg();
        this.log(`POLL #${this.pollCount} resend: ${msg} (silence: ${silenceSec}s)`);
        this.sendMessage(msg).catch((err) => this.log(`POLL resend failed: ${err}`));
      } else {
        this.log(`POLL #${this.pollCount} — no lastMoveSent, nothing to resend (silence: ${silenceSec}s)`);
      }
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      this.log(`POLL STOP after ${this.pollCount} ticks`);
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  cleanup(): void {
    if (this.ended) return;
    this.ended = true;
    this.log('CLEANUP');
    this.stopPolling();
    this.onGameEnd({ gameId: this.gameId, result: null, reason: null, pgn: this.chess.pgn() });
  }

  /**
   * Bot-side resign used during graceful shutdown. Sends RESIGN to the
   * opponent (so their UI shows a clean game-over) and ends the game
   * with the opponent winning by 'resign' — which triggers the normal
   * onGameEnd → handleGameEnd payout path. The opponent gets their
   * reward; we don't leave them hanging on a disconnect.
   */
  async forceResign(): Promise<void> {
    if (this.ended) return;
    this.log('FORCE RESIGN — bot shutting down');
    this.sendMessage(
      encodeMessage({ action: ACTION.RESIGN, gameId: this.gameId }),
    ).catch(() => {});
    const opponentColor = (this.myColor === 'w' ? 'b' : 'w') as GameOverResult;
    await this.endGame(opponentColor, 'resign');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
