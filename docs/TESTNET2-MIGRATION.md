# Bots → testnet2 migration / deploy notes (for infra)

**What this is:** how to deploy the updated bots (`kbbot`, `viktor`, `chess-bot`, `unicity-l3`) on **testnet2** with `@unicitylabs/sphere-sdk@0.11.4`. Source: PR #12 (branch `migrate/sphere-sdk-0.9.1-testnet2`) did the original testnet2 cutover on `0.10.3`; the SDK has since been bumped to **0.11.4** — a backwards-compatible minor upgrade (no bot code changes, same deploy procedure).

> ⚠️ **This is a testnet → testnet2 cutover.** Wallet **identity** carries over (same mnemonic ⇒ same `chainPubkey` + `@nametag` + Nostr history); on-chain **assets do not** (wallets start empty on testnet2). The `data/` dirs hold stale **v1 token state** and must be purged.

---

## 0. Pre-flight — do these BEFORE touching anything

1. **Confirm every bot's mnemonic is set in `.env`.** The bots do **not** auto-generate. After the data wipe (step 3) each bot re-creates its wallet from `*_MNEMONIC`; the same mnemonic ⇒ same `chainPubkey` + `@nametag`. A missing mnemonic = the bot refuses to start; a *changed* one = a new identity (loses the `@name`). Back up / verify: `KBBOT_MNEMONIC`, `VIKTOR_MNEMONIC`, `CHESS_BOT_MNEMONIC`, `L3_MNEMONIC`.
2. **Provision the new secrets/env** (see §1).
3. **Network egress:** the host needs outbound **HTTPS** to `gateway.testnet2.unicity.network` (aggregator, all bots) and `wallet-api.staging.unicity.network` (chess-bot only). Nostr relays (`wss://…unicity.network`) as before.
4. **Lockfile is already regenerated and committed** for 0.11.4 — Docker `--frozen-lockfile` builds will succeed. Do **not** hand-edit `pnpm-lock.yaml`.

---

## 1. Required `.env` (new / changed)

| Var | Value | Notes |
|---|---|---|
| `AGGREGATOR_KEY` | `sk_…` (testnet2 gateway key) | **Required.** Shared by all bots (v2 engine). If empty, the SDK falls back to a public default — fine for messaging bots, but set the real key (chess-bot moves money). |
| `WALLET_API_URL` | `https://wallet-api.staging.unicity.network` | chess-bot only. Must be **https off-loopback**. Has a compose default. |
| `CHESS_BOT_DEVICE_ID` | `chess-bot-prod-1` (stable) | chess-bot only. Stable device label. Compose default provided. |
| `KBBOT_NETWORK` / `VIKTOR_NETWORK` / `CHESS_BOT_NETWORK` / `L3_NETWORK` | `testnet2` | Compose **already defaults all four to `testnet2`** — only set to override. |
| `L3_AGGREGATOR_URL` | `https://gateway.testnet2.unicity.network/` | unicity-l3 block-poller endpoint. Compose default points here. ⚠️ verify this host serves the L3 block RPC (it does today). |
| `L3_GROUP_ID` | the chess/block group id | Required for l3 to post (e.g. `l3blocks`). |
| `*_MNEMONIC` (×4) | existing | Unchanged — keep identical (see §0). |

Removed: the bundled `trustbase-testnet.json` and `TRUSTBASE_PATH` — the SDK ships the testnet2 trustbase (networkId 4) baked in. Nothing to mount.

---

## 2. Deploy procedure

```bash
# 1. Get the code (after merge, or check out PR #12's branch)
git pull && git checkout main          # or: git checkout migrate/sphere-sdk-0.9.1-testnet2

# 2. Stop the stack
docker compose down

# 3. PURGE v1 token state (identity is rebuilt from mnemonics; assets are gone on testnet2).
#    KEEP data/mcp-rag/chromadb (the RAG vector DB — unrelated, expensive to rebuild).
rm -rf data/kbbot/data      data/kbbot/tokens \
       data/viktor/data     data/viktor/tokens \
       data/unicity-l3/data data/unicity-l3/tokens \
       data/chess-bot/tokens          # chess-bot /app/data is tmpfs → nothing on host

# 4. Rebuild (lockfile + source changed) and start
docker compose build --no-cache kbbot viktor chess-bot unicity-l3
docker compose up -d

# 5. Watch
docker compose logs -f --tail=100 chess-bot unicity-l3 kbbot viktor
```

---

## 3. Per-bot notes

- **kbbot, viktor** — messaging-only (DMs / group chat). No wallet-api, no money. Need only `NETWORK=testnet2` + `AGGREGATOR_KEY`. They no longer react to token transfers (that path was removed).
- **chess-bot** — the only money-moving bot. Full wallet-api wiring (`WALLET_API_URL` + stable `CHESS_BOT_DEVICE_ID`). Re-funds itself via **self-mint** on startup (no faucet). `/app/data` stays on **tmpfs** by design (perf); see §4.
- **unicity-l3** — posts block info to `L3_GROUP_ID`. Needs the `@unicity-l3` nametag **allowlisted to write** on the group's relay. Reads the testnet2 block aggregator (`L3_AGGREGATOR_URL`). Posts only **non-empty** blocks by default (`SHOW_EMPTY_BLOCKS=false`); links use `?network=testnet2&shard=<prefix>&block=<n>` to the smt-explorer.

---

## 4. Operational gotchas

- **chess-bot tmpfs is intentional.** `/app/data` is RAM-backed (perf: avoids per-event fsync stalling the WS reader). On testnet2 the wallet-api refresh token + cursors live there too, so a restart re-challenges (automatic) and re-syncs inventory from the server — accepted, because chess-bot is payout-only + self-mints (no incoming mailbox to lose). Do **not** "fix" it to a durable volume without revisiting the perf issue.
- **Node ≥ 22** — all bot Dockerfiles are already `node:22-alpine`. No change.
- **unicity-l3 quiet by default** — testnet2 blocks are mostly empty; the bot only posts blocks with transactions. Silence ≠ broken. (Set `SHOW_EMPTY_BLOCKS=true` only for noisy debugging.)
- **Expected, self-healing log lines** (not alerts): `Poll error … HTTP 502` (transient gateway blips — retried, no data lost); `Skipping missing block N … (gap)` (aggregator's `get_block_height` skips some round numbers — those are permanent gaps, safely skipped); `Block N … not ready … retrying next round` (tip not yet committed). Alert only on `Poll round error`, `Fatal`, OOM, or a crash/exit.
- **Backups (`scripts/bot-backup.sh`)** — `data/<bot>/data` now also holds the wallet-api refresh token + cursors. A restored token is valid only if the **same** `WALLET_API_DEVICE_ID` and mnemonic are used. chess-bot has no host `data/` (tmpfs) — nothing to back up there, by design.

---

## 5. Verification (healthy = …)

```bash
docker compose logs --tail=200 unicity-l3 chess-bot kbbot viktor
```
- All: `Wallet loaded. Nametag: @<name>` with the **same** `@name`/`chainPubkey` as before; no `INVALID_CONFIG`.
- **chess-bot**: a startup `Self-minting … UCT` line and a non-zero balance; plays games over Sphere, pays winners.
- **unicity-l3**: `Joined group` + `Discovered 8 shard(s): 000…111` + (when there's activity) `Posting: Block #…`. If posts fail with relay write-rejection, the `@unicity-l3` nametag isn't allowlisted on the group relay.
- **kbbot/viktor**: answer DMs.

---

## 6. Rollback

This is a network cutover, not a versioned data migration — there is no "downgrade" path for testnet2 data. To roll back to the old testnet: restore the previous image/tag, restore the pre-migration `data/<bot>` backups, and set `*_NETWORK=testnet`. The v1 aggregator (`goggregator-test.unicity.network`) and the old trustbase are still required for that path.
