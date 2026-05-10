import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, encodeMessage, ACTION } from '../src/protocol.js';

describe('protocol', () => {
  describe('parseMessage', () => {
    it('parses challenge with elo', () => {
      const raw = 'unichess:a1b2c3d4:ch:w:5:1300';
      const msg = parseMessage(raw);
      assert.ok(msg);
      assert.equal(msg.action, ACTION.CHALLENGE);
      if (msg.action !== ACTION.CHALLENGE) return;
      assert.equal(msg.gameId, 'a1b2c3d4');
      assert.equal(msg.color, 'w');
      assert.equal(msg.timeMinutes, 5);
      assert.equal(msg.elo, 1300);
    });

    it('defaults elo to 1500 if missing', () => {
      const msg = parseMessage('unichess:abcd1234:ch:b:3');
      assert.ok(msg);
      assert.equal(msg.action, ACTION.CHALLENGE);
      if (msg.action !== ACTION.CHALLENGE) return;
      assert.equal(msg.elo, 1500);
    });

    it('clamps elo to 200-3000 range', () => {
      const low = parseMessage('unichess:abcd1234:ch:w:5:50');
      assert.ok(low && low.action === ACTION.CHALLENGE);
      if (low.action === ACTION.CHALLENGE) assert.equal(low.elo, 200);

      const high = parseMessage('unichess:abcd1234:ch:w:5:9999');
      assert.ok(high && high.action === ACTION.CHALLENGE);
      if (high.action === ACTION.CHALLENGE) assert.equal(high.elo, 3000);
    });

    it('parses move message with moveNum', () => {
      const msg = parseMessage('unichess:a1b2c3d4:mv:e4:298000:b:3');
      assert.ok(msg);
      assert.equal(msg.action, ACTION.MOVE);
      if (msg.action !== ACTION.MOVE) return;
      assert.equal(msg.san, 'e4');
      assert.equal(msg.clockMs, 298000);
      assert.equal(msg.color, 'b');
      assert.equal(msg.moveNum, 3);
    });

    it('rejects move message without moveNum', () => {
      assert.equal(parseMessage('unichess:a1b2c3d4:mv:e4:298000:b'), null);
    });

    it('parses move with sentAtMs and round-trips it', () => {
      const raw = 'unichess:a1b2c3d4:mv:e4:298000:b:3:1717000000000';
      const msg = parseMessage(raw);
      assert.ok(msg);
      assert.equal(msg.action, ACTION.MOVE);
      if (msg.action !== ACTION.MOVE) return;
      assert.equal(msg.sentAtMs, 1717000000000);
      assert.equal(encodeMessage(msg), raw);
    });

    it('parses legacy move without sentAtMs (back-compat)', () => {
      // Old senders never include sentAtMs — the field must be absent, not 0/NaN.
      const msg = parseMessage('unichess:a1b2c3d4:mv:e4:298000:b:3');
      assert.ok(msg && msg.action === ACTION.MOVE);
      if (msg.action !== ACTION.MOVE) return;
      assert.equal(msg.sentAtMs, undefined);
      // Re-encoding must NOT introduce a trailing colon for an old-style message.
      assert.equal(encodeMessage(msg), 'unichess:a1b2c3d4:mv:e4:298000:b:3');
    });

    it('parses accept', () => {
      const msg = parseMessage('unichess:a1b2c3d4:ok');
      assert.ok(msg);
      assert.equal(msg.action, ACTION.ACCEPT);
      assert.equal(msg.gameId, 'a1b2c3d4');
    });

    it('parses resign', () => {
      const msg = parseMessage('unichess:a1b2c3d4:rs');
      assert.ok(msg);
      assert.equal(msg.action, ACTION.RESIGN);
    });

    it('parses heartbeat', () => {
      const msg = parseMessage('unichess:a1b2c3d4:hb:250000');
      assert.ok(msg);
      assert.equal(msg.action, ACTION.HEARTBEAT);
      if (msg.action === ACTION.HEARTBEAT) assert.equal(msg.clockMs, 250000);
    });

    it('parses game over', () => {
      const msg = parseMessage('unichess:a1b2c3d4:go:w:checkmate');
      assert.ok(msg);
      assert.equal(msg.action, ACTION.GAMEOVER);
      if (msg.action === ACTION.GAMEOVER) {
        assert.equal(msg.result, 'w');
        assert.equal(msg.reason, 'checkmate');
      }
    });

    it('parses draw offer/accept/decline', () => {
      assert.equal(parseMessage('unichess:a1b2c3d4:do')?.action, ACTION.DRAW_OFFER);
      assert.equal(parseMessage('unichess:a1b2c3d4:da')?.action, ACTION.DRAW_ACCEPT);
      assert.equal(parseMessage('unichess:a1b2c3d4:dd')?.action, ACTION.DRAW_DECLINE);
    });

    it('parses abort', () => {
      assert.equal(parseMessage('unichess:a1b2c3d4:ab')?.action, ACTION.ABORT);
    });

    it('returns null for invalid messages', () => {
      assert.equal(parseMessage('hello'), null);
      assert.equal(parseMessage('unichess:short:mv'), null);
      assert.equal(parseMessage('unichess:a1b2c3d4:xx'), null);
      assert.equal(parseMessage(''), null);
    });

    it('returns null for bad game ID length', () => {
      assert.equal(parseMessage('unichess:abc:ok'), null);
      assert.equal(parseMessage('unichess:toolonggameid1234:ok'), null);
    });
  });

  describe('encodeMessage', () => {
    it('encodes accept', () => {
      assert.equal(
        encodeMessage({ action: ACTION.ACCEPT, gameId: 'a1b2c3d4' }),
        'unichess:a1b2c3d4:ok',
      );
    });

    it('encodes move with moveNum', () => {
      assert.equal(
        encodeMessage({ action: ACTION.MOVE, gameId: 'a1b2c3d4', san: 'Nf3', clockMs: 295000, color: 'b', moveNum: 5 }),
        'unichess:a1b2c3d4:mv:Nf3:295000:b:5',
      );
    });

    it('encodes heartbeat', () => {
      assert.equal(
        encodeMessage({ action: ACTION.HEARTBEAT, gameId: 'a1b2c3d4', clockMs: 280000 }),
        'unichess:a1b2c3d4:hb:280000',
      );
    });

    it('encodes game over', () => {
      assert.equal(
        encodeMessage({ action: ACTION.GAMEOVER, gameId: 'a1b2c3d4', result: 'b', reason: 'checkmate' }),
        'unichess:a1b2c3d4:go:b:checkmate',
      );
    });

    it('encodes challenge', () => {
      assert.equal(
        encodeMessage({ action: ACTION.CHALLENGE, gameId: 'a1b2c3d4', color: 'w', timeMinutes: 5, elo: 1300 }),
        'unichess:a1b2c3d4:ch:w:5:1300',
      );
    });

    it('roundtrips messages', () => {
      const cases = [
        'unichess:a1b2c3d4:ok',
        'unichess:a1b2c3d4:no',
        'unichess:a1b2c3d4:mv:e4:300000:b:1',
        'unichess:a1b2c3d4:rs',
        'unichess:a1b2c3d4:hb:250000',
        'unichess:a1b2c3d4:go:d:stalemate',
        'unichess:a1b2c3d4:ab',
        'unichess:a1b2c3d4:ch:w:5:1300',
      ];
      for (const raw of cases) {
        const parsed = parseMessage(raw);
        assert.ok(parsed, `Failed to parse: ${raw}`);
        assert.equal(encodeMessage(parsed), raw);
      }
    });
  });
});
