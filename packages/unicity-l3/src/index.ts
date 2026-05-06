import { readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Sphere } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { AggregatorClient, displayShardId } from './aggregator.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const log = (msg: string) => console.log(`[unicity-l3] ${msg}`);

async function initSphere() {
  const providers = createNodeProviders({
    dataDir: config.dataDir,
    tokensDir: config.tokensDir,
    network: config.network,
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

  log(`Polling every ${config.pollIntervalMs}ms...`);

  // Poll loop
  const poll = async () => {
    for (const shardId of shardIds) {
      try {
        const height = await aggregator.getBlockHeight(shardId);
        const prev = lastBlock.get(shardId) || 0;

        if (height <= prev) continue;

        // Process new blocks (cap at 10 per poll to avoid flooding)
        const start = Math.max(prev + 1, height - 9);
        for (let blockNr = start; blockNr <= height; blockNr++) {
          try {
            const block = await aggregator.getBlock(blockNr, shardId);
            if (!config.showEmptyBlocks && block.totalCommitments === 0) continue;
            const shard = displayShardId(shardId);
            const explorerUrl = `${config.explorerBaseUrl}?shard=${shardId}&block=${blockNr}`;
            const message = `Block #${blockNr} | Shard ${shard} | ${block.totalCommitments} tx | ${explorerUrl}`;

            log(`Posting: ${message}`);
            await groupChat.sendMessage(config.groupId!, message);
          } catch (err) {
            log(`Failed to process block ${blockNr} shard ${shardId}: ${err}`);
          }
        }

        lastBlock.set(shardId, height);
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
