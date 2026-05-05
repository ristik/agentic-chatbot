import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StockfishEngine } from '../src/stockfish.js';

describe('StockfishEngine', () => {
  it('initializes and responds to UCI', async () => {
    const engine = new StockfishEngine();
    await engine.init();
    engine.destroy();
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
