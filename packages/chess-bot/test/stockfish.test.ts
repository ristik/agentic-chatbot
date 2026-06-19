import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StockfishEngine } from '../src/stockfish.js';

describe('StockfishEngine', () => {
  it('initializes and responds to UCI', async () => {
    const engine = new StockfishEngine();
    await engine.init();
    engine.destroy();
  });

  it('does not clobber globalThis.fetch on init', async () => {
    // stockfish-18-asm.js does a bare `fetch=null` in its Node branch which,
    // in non-strict CJS scope, wipes globalThis.fetch and breaks every later
    // SDK HTTP call (aggregator submit, faucet, etc). Regression guard.
    // Reseat fetch in case a previous test in this file already lost it.
    if (typeof globalThis.fetch !== 'function') {
      const undici = await import('undici');
      globalThis.fetch = undici.fetch as unknown as typeof globalThis.fetch;
    }
    const before = globalThis.fetch;
    assert.equal(typeof before, 'function');

    const engine = new StockfishEngine();
    await engine.init();
    try {
      assert.equal(typeof globalThis.fetch, 'function', 'fetch was nulled by stockfish init');
      assert.equal(globalThis.fetch, before, 'fetch was replaced by stockfish init');
    } finally {
      engine.destroy();
    }
  });

  it('post-init fetch reaches the testnet2 aggregator', async (t) => {
    // Beyond the identity check above: actually exercise fetch against the
    // network. The SDK's JsonRpcHttpTransport calls bare `fetch(...)` (no
    // captured reference), so a direct fetch from this test resolves the same
    // global the SDK does — equivalent today.
    const baseUrl = process.env.AGGREGATOR_URL || 'https://gateway.testnet2.unicity.network';
    const healthUrl = baseUrl.replace(/\/$/, '') + '/health';

    const engine = new StockfishEngine();
    await engine.init();
    try {
      let response: Response;
      try {
        response = await fetch(healthUrl, { signal: AbortSignal.timeout(8_000) });
      } catch (err) {
        // Network/DNS failure — fetch itself is fine, the testnet just isn't
        // reachable from here. Skip rather than red the suite.
        t.skip(`aggregator unreachable: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      assert.ok(response.ok, `aggregator /health returned HTTP ${response.status}`);
    } finally {
      engine.destroy();
    }
  });

  it('returns a valid move from the starting position', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    const move = await engine.getBestMove({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      thinkTimeMs: 500,
      elo: 1500,
      gameId: 'test-start',
    });

    // UCI move: 4 chars (e.g. e2e4) or 5 with promotion (e.g. e7e8q)
    assert.ok(move.length >= 4 && move.length <= 5, `Unexpected move format: ${move}`);
    engine.destroy();
  });

  it('returns a move from a mid-game position', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    // Italian Game position
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    const move = await engine.getBestMove({
      fen,
      thinkTimeMs: 500,
      elo: 1300,
      gameId: 'test-mid',
    });
    assert.ok(move.length >= 4);
    engine.destroy();
  });

  it('works at low ELO with depth limiting', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    const move = await engine.getBestMove({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      thinkTimeMs: 300,
      elo: 800,
      gameId: 'test-low',
    });
    assert.ok(move.length >= 4);
    engine.destroy();
  });

  it('works at high ELO', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    const move = await engine.getBestMove({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      thinkTimeMs: 500,
      elo: 2100,
      gameId: 'test-high',
    });
    assert.ok(move.length >= 4);
    engine.destroy();
  });

  it('finds checkmate in one', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    // Mate in 1: Qh5 is checkmate (Scholar's mate setup)
    // White to move, Qxf7#
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const move = await engine.getBestMove({
      fen,
      thinkTimeMs: 1000,
      elo: 2100,
      gameId: 'test-mate',
    });
    // Qxf7# in UCI = h5f7
    assert.equal(move, 'h5f7');
    engine.destroy();
  });

  it('reuses one engine across multiple games', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    const move1 = await engine.getBestMove({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      thinkTimeMs: 300,
      elo: 1500,
      gameId: 'shared-A',
    });
    assert.ok(move1.length >= 4);

    const move2 = await engine.getBestMove({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      thinkTimeMs: 300,
      elo: 2000,
      gameId: 'shared-B',
    });
    assert.ok(move2.length >= 4);

    const move3 = await engine.getBestMove({
      fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      thinkTimeMs: 300,
      elo: 1500,
      gameId: 'shared-A',
    });
    assert.ok(move3.length >= 4);

    engine.destroy();
  });

  it('serializes concurrent getBestMove calls', async () => {
    const engine = new StockfishEngine();
    await engine.init();

    const [a, b] = await Promise.all([
      engine.getBestMove({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        thinkTimeMs: 200,
        elo: 1500,
        gameId: 'concurrent-A',
      }),
      engine.getBestMove({
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        thinkTimeMs: 200,
        elo: 1500,
        gameId: 'concurrent-B',
      }),
    ]);

    assert.ok(a.length >= 4);
    assert.ok(b.length >= 4);
    engine.destroy();
  });
});
