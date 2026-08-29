# Testing chess-bot before deploying

chess-bot is the only bot that moves money, so a bad deploy costs real payouts.
Three levels, cheapest first. Run 1 and 2 on every change; run 3 before any
change that touches the payout or storage path.

## 1. Automated (no credentials, no network)

```bash
cd packages/chess-bot && npm test
```

Covers the payout logic directly:

- `test/wallet.test.ts` — `sendReward()` honours its `{ok, error}` contract:
  a failed balance read must not become a rejected promise, because the caller
  marks the game in `paidGameIds` *before* sending and only un-marks it on the
  `!ok` branch.
- `test/split-storage.test.ts` — money-critical payments-v2 keys route to the
  durable tier; the hot stream cursor stays on tmpfs.
- `test/restart-durability.test.ts` — an open intent survives a simulated
  container restart. Includes a CONTROL case that reproduces the original bug
  on a single tmpfs-backed store, so the pair proves the fix rather than just
  exercising the new code.

**Confirm the tests still bite.** A test that passes against broken code
asserts nothing. To check, revert a fix and confirm failures — e.g. make
`isDurableKey()` return `false` (4 of 10 storage tests should fail), or restore
the unguarded `await this.getBalanceUct()` in `sendReward()` (2 of 3 wallet
tests should fail).

## 2. Local run against testnet2

Runs the real bot on the real network under a throwaway identity, so nothing
touches the production nametag or wallet.

```bash
# From the repo root, with AGGREGATOR_KEY set.
export AGGREGATOR_KEY=...
export WALLET_API_URL=https://wallet-api.staging.unicity.network
export NETWORK=testnet2

# A throwaway identity — NOT the production nametag or mnemonic.
export BOT_NAMETAG=chess-bot-staging-$USER
export BOT_MNEMONIC=            # leave empty on first run; the bot prints one
export WALLET_API_DEVICE_ID=chess-bot-staging-$USER

# Local dirs. JOURNAL_DIR is the durable tier — keep it OUT of /tmp so you can
# prove it survives a restart.
export DATA_DIR=./data/chess-staging/data
export JOURNAL_DIR=./data/chess-staging/journal

# No group posts while testing.
unset GROUP_ID

cd packages/chess-bot && pnpm dev
```

First run prints `*** SAVE THIS MNEMONIC ***` — put it in `BOT_MNEMONIC` so
later runs reuse the same wallet. Then watch for:

```
[chess-bot] Nametag: @chess-bot-staging-...
[chess-bot][wallet] balance low: 0 UCT < 100. Self-minting ...
[chess-bot][wallet] balance after self-mint: 1000 UCT
[chess-bot] Stockfish ready
```

A successful self-mint is the real signal that the 0.15 `payments.mint()`
migration works — it's the first live exercise of the new payments API.

Now challenge `@chess-bot-staging-...` from the chess dApp and beat it. Pick the
lowest ELO — that's the T1mo tier (`rewardForElo`: ELO < 1000 → 20 UCT), the
cheapest win to engineer. Expect:

```
[chess-bot] Bot lost game <id> (elo 800) — paying 20 UCT to @you
[chess-bot][wallet] reward sent: 20 UCT → @you (id=..., status=...)
```

Then confirm the UCT actually arrived in your wallet. The log line alone is not
proof — `sendReward()` deliberately reports `ok` for a send left pending
confirmation.

## 3. The restart test (the bug that stranded a reward)

This is the scenario that automated tests can only simulate. Do it before any
deploy that touches storage.

1. Start the bot as in step 2 and beat it.
2. The moment you see `Bot lost game ... — paying`, kill it hard:
   `pkill -9 -f chess-bot`. `-9` matters — it skips the graceful drain and
   leaves the intent open, which is exactly the production restart case.
3. Confirm the journal survived the kill:
   ```bash
   cat ./data/chess-staging/journal/payments-journal.json | grep -o 'intents'
   ```
   Non-empty means the durable tier is working. If this file is missing,
   `JOURNAL_DIR` isn't wired up and the reward is already lost.
4. Restart the bot with the same `BOT_MNEMONIC`, `DATA_DIR` and `JOURNAL_DIR`.
5. `Sphere.init` runs a resume on startup, and `RESUME_INTERVAL_MS` (default 5
   min) retries after. Watch for the payout completing, then confirm the UCT
   landed in your wallet.

To see the failure this guards against, repeat with `JOURNAL_DIR` pointed at
the same tmpfs-style path as `DATA_DIR` and wipe it between steps 2 and 4 — the
reward never arrives and nothing logs an error.

## Deploy notes

- `JOURNAL_DIR` must be a real volume, never tmpfs. `docker-compose.yml` maps
  it to `./data/chess-bot/journal`; verify the mount exists on the host before
  the first prod run.
- The journal starts empty. Any intent already open on the running bot is
  unrecoverable — this change prevents the next loss, it does not recover past
  ones.
- Check `stop_grace_period` (150s) still exceeds
  `SHUTDOWN_GRACE_MS` + `SHUTDOWN_PAYOUT_WAIT_MS`, or Docker will SIGKILL the
  bot mid-drain and re-open the very window step 3 tests.
