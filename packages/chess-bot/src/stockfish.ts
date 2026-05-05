import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface SearchOptions {
  fen: string;
  thinkTimeMs: number;
  elo: number;
  gameId: string;
}

export class StockfishEngine extends EventEmitter {
  private engine: { ccall: (fn: string, ret: string | null, types: string[], args: string[], opts?: Record<string, unknown>) => void; listener: ((line: string) => void) | null } | null = null;
  private destroyed = false;
  private currentElo: number | null = null;
  private currentGameId: string | null = null;
  // Serializes concurrent getBestMove() calls — UCI is single-threaded.
  private busy: Promise<void> = Promise.resolve();

  private async create(): Promise<void> {
    // Use the lite ASM.JS build: pure JS, no WASM/SharedArrayBuffer/worker issues.
    const sfPath = require.resolve('stockfish/bin/stockfish-18-asm.js');
    const outerFactory = require(sfPath);
    const innerFactory = outerFactory();
    const engineModule = await innerFactory();

    this.engine = engineModule;
    this.engine!.listener = (line: string) => {
      const trimmed = typeof line === 'string' ? line.trim() : String(line).trim();
      if (trimmed) this.emit('line', trimmed);
    };
  }

  private send(cmd: string): void {
    if (this.destroyed || !this.engine) return;
    // The 'go' command needs async:true for Emscripten asyncify support
    const isAsync = /^go\b/.test(cmd);
    this.engine.ccall('command', null, ['string'], [cmd], isAsync ? { async: true } : undefined);
  }

  private waitFor(prefix: string, timeoutMs = 10_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('line', handler);
        reject(new Error(`Stockfish timeout waiting for "${prefix}" after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (line: string) => {
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          this.off('line', handler);
          resolve(line);
        }
      };
      this.on('line', handler);
    });
  }

  /** Initialize the engine. Call once per process. */
  async init(): Promise<void> {
    if (this.engine || this.destroyed) return;
    await this.create();

    // Register listener BEFORE sending to catch synchronous output from ccall
    const uciOk = this.waitFor('uciok', 30_000);
    this.send('uci');
    await uciOk;

    this.send('setoption name UCI_LimitStrength value true');
    this.send('setoption name Threads value 1');
    this.send('setoption name Hash value 16');
    const ready = this.waitFor('readyok');
    this.send('isready');
    await ready;
  }

  /** Lock must be held by caller. Reconfigure engine when game or Elo changes. */
  private async reconfigureFor(gameId: string, elo: number): Promise<void> {
    if (this.currentGameId === gameId && this.currentElo === elo) return;

    this.send('ucinewgame');
    if (this.currentElo !== elo) {
      this.send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
      if (elo < 1320) {
        // Skill Level: 200→0, 800→3, 1000→5, 1320→8
        const skillLevel = Math.max(0, Math.min(8, Math.round(((elo - 200) / 1120) * 8)));
        this.send(`setoption name Skill Level value ${skillLevel}`);
      }
    }
    const ready = this.waitFor('readyok');
    this.send('isready');
    await ready;

    this.currentGameId = gameId;
    this.currentElo = elo;
  }

  /** Compute the best move. Concurrent callers are queued via an internal mutex. */
  async getBestMove(opts: SearchOptions): Promise<string> {
    const prev = this.busy;
    let release!: () => void;
    this.busy = new Promise<void>((res) => {
      release = res;
    });
    try {
      await prev;
      if (!this.engine || this.destroyed) {
        throw new Error('Engine not initialized');
      }

      await this.reconfigureFor(opts.gameId, opts.elo);

      this.send(`position fen ${opts.fen}`);
      let goCmd = `go movetime ${Math.max(100, opts.thinkTimeMs)}`;
      if (opts.elo < 1320) {
        // Depth: 200→1, 500→1, 800→2, 1000→3, 1320→4
        const maxDepth = Math.max(1, Math.min(4, Math.ceil(((opts.elo - 200) / 1120) * 4)));
        goCmd += ` depth ${maxDepth}`;
      }

      const bestMove = this.waitFor('bestmove', opts.thinkTimeMs + 30_000);
      this.send(goCmd);

      let line: string;
      try {
        line = await bestMove;
      } catch (err) {
        // Drain stale state so the next caller is not poisoned by a late bestmove.
        try {
          this.send('stop');
          await this.waitFor('bestmove', 5_000);
        } catch {
          // Best effort — give up draining
        }
        throw err;
      }

      const parts = line.split(/\s+/);
      const move = parts[1];
      if (!move || move === '(none)') {
        throw new Error('Stockfish returned no move');
      }
      return move;
    } finally {
      release();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.send('quit');
    } catch {}
    if (this.engine) {
      this.engine.listener = null;
      this.engine = null;
    }
    this.removeAllListeners();
  }
}
