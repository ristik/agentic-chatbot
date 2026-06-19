import { readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { AggregatorClient, displayShardId } from './aggregator.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const log = (msg: string) => console.log(`[unicity-l3] ${msg}`);

async function initSphere() {
  // Messaging-only bot (group-chat block poster): Nostr transport + the oracle
  // the v2 engine needs. `network` is required on 0.9.x (testnet2) and the
  // aggregator apiKey must be injected. No wallet-api wrapper — it moves no money.
  const providers = createNodeProviders({
    dataDir: config.dataDir,
    tokensDir: config.tokensDir,
    network: config.network,
    oracle: { apiKey: process.env.AGGREGATOR_KEY || undefined },
  });

  // Check if an exported wallet JSON (sphere-wallet format) is waiting to be imported
  const importFile = join(config.dataDir, 'import-wallet.json');
  try {
    const raw = readFileSync(importFile, 'utf-8');
    const data = JSON.parse(raw);
    if (data.type === 'sphere-wallet') {
      log('Found import-wallet.json — importing...');
      const result = await Sphere.importFromJSON({
        ...providers,
        network: config.network, // required: every Sphere entry point must forward network
        jsonContent: raw,
        nametag: config.nametag,
        groupChat: true,
      });
      if (!result.success) {
        throw new Error(`Import failed: ${result.error}`);
      }
      // Rename so we don't re-import on next restart
      renameSync(importFile, join(config.dataDir, 'import-wallet.json.done'));
      log('Wallet imported successfully');
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  // Normal init — loads existing wallet or auto-generates new one
  const { sphere, created, generatedMnemonic } = await Sphere.init({
    ...providers,
    network: config.network, // required: Sphere.init forwards it to configure the TokenRegistry
    autoGenerate: false,
    nametag: config.nametag,
    mnemonic: config.mnemonic,
    groupChat: true,
  });

  if (created) {
    log(`New wallet created. Nametag: ${config.nametag}`);
    if (generatedMnemonic) {
      log(`Mnemonic (save this!): ${generatedMnemonic}`);
    }
  } else {
    log(`Wallet loaded. Nametag: ${config.nametag}`);
  }

  // Re-publish the Nostr nametag binding (idempotent). The binding carries over
  // from the old testnet — it lives on Nostr, not on-chain — but re-registering
  // ensures @name resolves on testnet2 and best-effort mints the v2 Unicity-ID
  // token. Non-fatal: a failure here must not stop block posting.
  try {
    await sphere.registerNametag(config.nametag);
    log(`Nametag @${config.nametag} ensured`);
  } catch (err) {
    log(`registerNametag (non-fatal): ${(err as Error)?.message ?? err}`);
  }

  return sphere;
}

async function main() {
  log('Starting...');

  const sphere = await initSphere();

  // Log Nostr pubkey so it can be used to create/join groups
  const identity = sphere.identity;
  if (identity) {
    const nostrPubkey = identity.chainPubkey.slice(2); // x-only 32 bytes
    log(`Nostr pubkey: ${nostrPubkey}`);
  }

  if (!config.groupId) {
    log('GROUP_ID not set. Set it and restart to begin posting block updates.');
    // Keep process alive so the wallet persists
    setInterval(() => {}, 60000);
    return;
  }

  // Connect group chat
  const groupChat = sphere.groupChat;
  if (!groupChat) {
    throw new Error('GroupChat module not initialized');
  }
  await groupChat.connect();
  log(`Group chat connected. Target group: ${config.groupId}`);

  // Join group if not already a member
  try {
    await groupChat.joinGroup(config.groupId);
    log('Joined group');
  } catch {
    log('Already in group or join not needed');
  }

  // Init aggregator client and discover shards
  const aggregator = new AggregatorClient(config.aggregatorUrl);
  const shardIds = await aggregator.fetchShardIds();
  log(`Discovered ${shardIds.length} shard(s): ${shardIds.join(', ')}`);

  // Track last seen block per shard
  const lastBlock = new Map<string, number>();

  // Initialize with current block heights
  for (const shardId of shardIds) {
    try {
      const height = await aggregator.getBlockHeight(shardId);
      lastBlock.set(shardId, height);
      log(`Shard ${shardId}: current block height ${height}`);
    } catch (err) {
      log(`Failed to get initial height for shard ${shardId}: ${err}`);
      lastBlock.set(shardId, 0);
    }
  }

  log(`Polling every ${config.pollIntervalMs}ms (max ${config.maxBlocksPerRound} blocks/shard/round)...`);

  // Periodic memory instrumentation — a leak guard so unbounded working-set
  // growth shows up in the logs/metrics early instead of as host swap-thrash.
  const memTimer = setInterval(() => {
    const m = process.memoryUsage();
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    log(`mem: rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB heapTotal=${mb(m.heapTotal)}MB external=${mb(m.external)}MB`);
  }, 5 * 60 * 1000);
  memTimer.unref();

  // Poll loop
  const poll = async () => {
    for (const shardId of shardIds) {
      try {
        const height = await aggregator.getBlockHeight(shardId);
        const prev = lastBlock.get(shardId) ?? 0;

        if (height <= prev) continue;

        // Bound the work per round. If we're more than maxBlocksPerRound
        // behind, skip the stale older blocks and only announce the most
        // recent window. This stops a growing backlog from queuing an
        // unbounded number of sendMessage calls (the runaway that drove
        // ~5 GB working-set growth under host load — see issue #7).
        let start = prev + 1;
        const behind = height - prev;
        if (behind > config.maxBlocksPerRound) {
          start = height - config.maxBlocksPerRound + 1;
          log(`Shard ${shardId}: ${behind} blocks behind; skipping ${start - prev - 1} stale block(s), announcing from #${start}`);
          lastBlock.set(shardId, start - 1);
        }

        for (let blockNr = start; blockNr <= height; blockNr++) {
          try {
            const block = await aggregator.getBlock(blockNr, shardId);
            if (config.showEmptyBlocks || block.totalCommitments > 0) {
              const shard = displayShardId(shardId);
              const explorerUrl = `${config.explorerBaseUrl}?network=${config.network}&shard=${shardId}&block=${blockNr}`;
              const message = `Block #${blockNr} | Shard ${shard} | ${block.totalCommitments} tx | ${explorerUrl}`;

              log(`Posting: ${message}`);
              await groupChat.sendMessage(config.groupId!, message);
            }
            // Advance the high-water mark ONLY after the block was successfully
            // fetched and (if non-empty) posted. Advancing on failure would
            // permanently skip a block on a transient aggregator error (e.g. a
            // 502) — including a non-empty one. Per-block (not per-round) so an
            // interrupted round never re-announces an already-posted block.
            lastBlock.set(shardId, blockNr);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const notFound = msg.includes('block not found') || msg.includes('Failed to get block');
            if (notFound && blockNr < height) {
              // Permanent gap: the aggregator's height runs ahead and skips some
              // round numbers, so this block has no data while blocks beyond it
              // exist. Advance past it (don't wedge the shard) — there is no block
              // to lose. Only the tip / transient (5xx) failures are retried.
              log(`Skipping missing block ${blockNr} shard ${shardId} (gap; chain moved past it)`);
              lastBlock.set(shardId, blockNr);
              continue;
            }
            // Tip not yet committed, or a transient error: keep the high-water
            // mark and retry this same block on the next poll (no block dropped).
            log(`Block ${blockNr} shard ${shardId} not ready: ${msg} — retrying next round`);
            break;
          }
        }
      } catch (err) {
        log(`Poll error shard ${shardId}: ${err}`);
      }
    }
  };

  // Self-rescheduling poll so a slow round can never overlap the next one.
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    setTimeout(async () => {
      try {
        await poll();
      } catch (err) {
        log(`Poll round error: ${err}`);
      } finally {
        schedule();
      }
    }, config.pollIntervalMs);
  };
  schedule();

  // Graceful shutdown
  const shutdown = () => {
    log('Shutting down...');
    stopped = true;
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[unicity-l3] Fatal:', error);
  process.exit(1);
});
