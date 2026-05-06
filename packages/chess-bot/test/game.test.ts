import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { StockfishEngine } from '../src/stockfish.js';
import { parseMessage, ACTION } from '../src/protocol.js';

describe('Game', () => {
  // One shared engine matches the production setup (chess-bot owns one engine).
  let engine: StockfishEngine;

  before(async () => {
    engine = new StockfishEngine();
    await engine.init();
  });

  after(() => {
    engine?.destroy();
  });

  it('bot plays white — makes first move and sends it', async () => {
    const sent: string[] = [];
    let ended = false;

    const game = new Game({
      gameId: 'test0001',
      myColor: 'w',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: () => { ended = true; },
    });

    await game.start();

    // Bot should have sent a move message
    assert.ok(sent.length >= 1, 'Bot should send at least one message');
    const moveMsg = parseMessage(sent[sent.length - 1]);
    assert.ok(moveMsg);
    assert.equal(moveMsg.action, ACTION.MOVE);
    if (moveMsg.action === ACTION.MOVE) {
      assert.equal(moveMsg.color, 'w'); // Bot is white, so color = w
      assert.ok(moveMsg.clockMs > 0);
      assert.ok(moveMsg.san.length >= 2);
    }

    game.cleanup();
  });

  it('bot plays black — waits for opponent move then responds', async () => {
    const sent: string[] = [];

    const game = new Game({
      gameId: 'test0002',
      myColor: 'b',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: () => {},
    });

    await game.start();

    // Bot is black, should not have sent a move yet (only heartbeats possible)
    const moves = sent.filter((m) => m.includes(':mv:'));
    assert.equal(moves.length, 0, 'Bot should not move before opponent');

    // Simulate opponent's first move: e4
    await game.handleMessage({
      action: ACTION.MOVE,
      gameId: 'test0002',
      san: 'e4',
      clockMs: 298000,
      color: 'w',
      moveNum: 1,
    });

    // Now bot should have responded with a move
    const botMoves = sent.filter((m) => m.includes(':mv:'));
    assert.ok(botMoves.length >= 1, 'Bot should respond with a move');
    const parsed = parseMessage(botMoves[0]);
    assert.ok(parsed && parsed.action === ACTION.MOVE);
    if (parsed.action === ACTION.MOVE) {
      assert.equal(parsed.color, 'b'); // Bot is black, so color = b
    }

    game.cleanup();
  });

  it('bot declines draw offers', async () => {
    const sent: string[] = [];

    const game = new Game({
      gameId: 'test0003',
      myColor: 'b',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: () => {},
    });

    await game.start();

    await game.handleMessage({
      action: ACTION.DRAW_OFFER,
      gameId: 'test0003',
    });

    const decline = sent.find((m) => m.includes(':dd'));
    assert.ok(decline, 'Bot should decline draw');

    game.cleanup();
  });

  it('handles opponent resign', async () => {
    const sent: string[] = [];
    let endedGameId = '';

    const game = new Game({
      gameId: 'test0004',
      myColor: 'b',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: (info) => { endedGameId = info.gameId; },
    });

    await game.start();

    await game.handleMessage({
      action: ACTION.RESIGN,
      gameId: 'test0004',
    });

    // Should send game over with bot as winner
    const goMsg = sent.find((m) => m.includes(':go:'));
    assert.ok(goMsg, 'Should send game over');
    const parsed = parseMessage(goMsg!);
    assert.ok(parsed && parsed.action === ACTION.GAMEOVER);
    if (parsed.action === ACTION.GAMEOVER) {
      assert.equal(parsed.result, 'b'); // Bot is black, wins
      assert.equal(parsed.reason, 'resign');
    }

    assert.equal(endedGameId, 'test0004');
  });

  it('handles abort before 2 moves', async () => {
    let endedGameId = '';

    const game = new Game({
      gameId: 'test0005',
      myColor: 'b',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async () => {},
      onGameEnd: (info) => { endedGameId = info.gameId; },
    });

    await game.start();

    await game.handleMessage({
      action: ACTION.ABORT,
      gameId: 'test0005',
    });

    assert.equal(endedGameId, 'test0005');
  });

  it('opponent-reported gameover (bot wins) routes through endGame', async () => {
    const sent: string[] = [];
    let endInfo: { gameId: string; result: string | null; reason: string | null } | null = null;

    const game = new Game({
      gameId: 'go-botwin',
      myColor: 'w',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: (info) => { endInfo = { gameId: info.gameId, result: info.result, reason: info.reason }; },
    });
    await game.start();

    // Opponent (black) declares their own loss — e.g. their client detected
    // their own clock ran out. Bot should run the full end-of-game routine.
    await game.handleMessage({
      action: ACTION.GAMEOVER,
      gameId: 'go-botwin',
      result: 'w',
      reason: 'timeout',
    });

    assert.ok(endInfo, 'onGameEnd should have fired');
    assert.equal(endInfo!.result, 'w');
    assert.equal(endInfo!.reason, 'timeout');
    assert.ok(sent.some((m) => m.includes(':go:w:timeout')), 'bot should ack with its own gameover');
    assert.ok(sent.includes('gg'), 'bot should send gg');
  });

  it('opponent-reported draw routes through endGame', async () => {
    const sent: string[] = [];
    let endInfo: { result: string | null; reason: string | null } | null = null;

    const game = new Game({
      gameId: 'go-draw00',
      myColor: 'b',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: (info) => { endInfo = { result: info.result, reason: info.reason }; },
    });
    await game.start();

    await game.handleMessage({
      action: ACTION.GAMEOVER,
      gameId: 'go-draw00',
      result: 'd',
      reason: 'agreement',
    });

    assert.ok(endInfo);
    assert.equal(endInfo!.result, 'd');
    assert.equal(endInfo!.reason, 'agreement');
    assert.ok(sent.some((m) => m.includes(':go:d:agreement')));
  });

  it('rejects unverifiable opponent claim that bot lost (fake checkmate)', async () => {
    const sent: string[] = [];
    let endInfo: { result: string | null; reason: string | null } | null = null;

    const game = new Game({
      gameId: 'go-fakecm',
      myColor: 'w',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: (info) => { endInfo = { result: info.result, reason: info.reason }; },
    });
    await game.start();
    sent.length = 0; // discard opening move

    // Opponent claims they checkmated the bot, but the position is not mate.
    await game.handleMessage({
      action: ACTION.GAMEOVER,
      gameId: 'go-fakecm',
      result: 'b',
      reason: 'checkmate',
    });

    assert.ok(endInfo, 'onGameEnd should still fire (cleanup path)');
    assert.equal(endInfo!.result, null, 'cleanup path leaves result null so no reward is paid');
    assert.equal(endInfo!.reason, null);
    assert.ok(!sent.some((m) => m.includes(':go:')), 'bot must not echo the fake gameover');
    assert.ok(!sent.includes('gg'), 'bot must not send gg for a rejected claim');
  });

  it('rejects opponent claim that bot lost on time', async () => {
    let endInfo: { result: string | null } | null = null;

    const game = new Game({
      gameId: 'go-faketo',
      myColor: 'b',
      timeControlMs: 300_000,
      elo: 1500,
      engine,
      sendMessage: async () => {},
      onGameEnd: (info) => { endInfo = { result: info.result }; },
    });
    await game.start();

    await game.handleMessage({
      action: ACTION.GAMEOVER,
      gameId: 'go-faketo',
      result: 'w',
      reason: 'timeout',
    });

    // Bot is black, so result='w' means opponent claims bot lost on time.
    // The bot itself would have detected its own timeout; trust nothing here.
    assert.ok(endInfo);
    assert.equal(endInfo!.result, null);
  });

  it('plays a full short game (bot vs simulated opponent)', async () => {
    // Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
    const opponentMoves = ['e5', 'Nc6', 'Nf6'];
    let moveIndex = 0;
    const sent: string[] = [];
    let endedGameId = '';

    const game = new Game({
      gameId: 'test0006',
      myColor: 'w',
      timeControlMs: 300_000,
      elo: 2100,
      engine,
      sendMessage: async (msg) => { sent.push(msg); },
      onGameEnd: (info) => { endedGameId = info.gameId; },
    });

    await game.start();

    // Play through opponent responses until game ends or moves exhausted
    while (moveIndex < opponentMoves.length && !endedGameId) {
      const opMove = opponentMoves[moveIndex];
      moveIndex++;
      await game.handleMessage({
        action: ACTION.MOVE,
        gameId: 'test0006',
        san: opMove,
        clockMs: 290000,
        color: 'w',
        moveNum: moveIndex * 2, // even numbers for opponent moves
      });
    }

    // Game might not end with Scholar's mate since Stockfish picks its own moves.
    // But it should have played several moves without crashing.
    const botMoves = sent.filter((m) => m.includes(':mv:'));
    assert.ok(botMoves.length >= 1, 'Bot should have made moves');

    game.cleanup();
  });
});
