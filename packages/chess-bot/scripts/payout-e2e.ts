/**
 * Live end-to-end check of the reward payout path against a real network.
 *
 *   AGGREGATOR_KEY=... pnpm --filter @agentic/chess-bot test:e2e
 *
 * Deliberately NOT part of `npm test`: it needs network access, an aggregator
 * key, and it mints real (testnet) tokens. Run it before deploying anything
 * that touches the payout or storage path — see TESTING.md.
 *
 * What it proves that the unit tests cannot: that `sendReward()` — the exact
 * call `handleGameEnd()` makes when the bot loses — actually moves UCT into
 * another wallet under the current SDK. Both wallets are created fresh on every
 * run with generated mnemonics, so it never touches the production bot's
 * identity, and the bot wallet funds itself via self-mint (which also exercises
 * `payments.mint()`).
 *
 * Exits 0 only if the recipient's confirmed balance actually rises by the
 * reward amount. A `sendReward()` that merely reports `ok` is NOT a pass: it
 * deliberately returns ok for a send left pending confirmation.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sphere, TokenRegistry } from '@unicitylabs/sphere-sdk';
import { createNodeProviders } from '@unicitylabs/sphere-sdk/impl/nodejs';
import { createWalletApiProviders } from '@unicitylabs/sphere-sdk/impl/shared/wallet-api';
import { BotWallet } from '../src/wallet.js';
import { createSplitStorageProvider } from '../src/split-storage.js';
import { rewardForElo } from '../src/rewards.js';

type Network = 'mainnet' | 'testnet' | 'testnet2' | 'dev';

const NETWORK = (process.env.NETWORK || 'testnet2') as Network;
const WALLET_API_URL = process.env.WALLET_API_URL || 'https://wallet-api.staging.unicity.network';
const AGGREGATOR_KEY = process.env.AGGREGATOR_KEY;
const COIN_SYMBOL = process.env.COIN_SYMBOL || 'UCT';
const UCT_COIN_ID_FALLBACK = 'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0';

/** The T1mo tier — the reward a sub-1000 ELO loss pays out. */
const REWARD = rewardForElo(800);
const DELIVERY_TIMEOUT_MS = 120_000;
const POLL_MS = 10_000;

if (!AGGREGATOR_KEY) {
  console.error(
    'AGGREGATOR_KEY is required — without it the gateway is unauthenticated and\n' +
      'mint certification never confirms. See .env.example.',
  );
  process.exit(2);
}

/**
 * Unicity IDs are lowercase alphanumeric/underscore/hyphen, 3-20 chars — so the
 * generated nametags have to stay short. Asserted rather than assumed: an
 * over-long name only fails at registerNametag(), deep into the run.
 */
const MAX_NAMETAG = 20;
const suffix = () => Math.random().toString(36).slice(2, 8);
function nametag(prefix: string): string {
  const tag = `${prefix}${suffix()}`;
  if (tag.length > MAX_NAMETAG || !/^[a-z0-9_-]{3,20}$/.test(tag)) {
    throw new Error(`generated nametag "${tag}" is not a valid Unicity ID`);
  }
  return tag;
}

async function initWallet(opts: { nametag: string; deviceId: string; root: string }) {
  const dataDir = join(opts.root, 'data');
  const journalDir = join(opts.root, 'journal');

  const base = createNodeProviders({
    network: NETWORK,
    dataDir,
    oracle: { apiKey: AGGREGATOR_KEY },
  });
  // Mirror the bot's production wiring, so this exercises the split provider too.
  base.storage = createSplitStorageProvider({ fastDir: dataDir, durableDir: journalDir, network: NETWORK });

  const providers = createWalletApiProviders(base, {
    baseUrl: WALLET_API_URL,
    network: NETWORK,
    deviceId: opts.deviceId,
  });

  const { sphere } = await Sphere.init({
    ...providers,
    network: NETWORK,
    autoGenerate: true, // throwaway identity, generated per run
    nametag: opts.nametag,
    communications: { cacheMessages: false },
  });
  return sphere;
}

async function coinId(): Promise<string> {
  await TokenRegistry.waitForReady(5_000).catch(() => {});
  const id = TokenRegistry.getInstance().getCoinIdBySymbol(COIN_SYMBOL);
  return (id ?? UCT_COIN_ID_FALLBACK).toLowerCase();
}

async function confirmedBalance(sphere: Sphere): Promise<number> {
  const id = await coinId();
  const assets = await sphere.payments.assets(id);
  const asset = assets.find((a) => a.coinId === id);
  if (!asset) return 0;
  return Number(BigInt(asset.confirmedAmount) / 10n ** BigInt(asset.decimals));
}

async function main(): Promise<number> {
  const root = await mkdtemp(join(tmpdir(), 'chess-payout-e2e-'));
  const botNametag = nametag('e2e-bot-');
  const winnerNametag = nametag('e2e-win-');
  let bot: Sphere | undefined;
  let winner: Sphere | undefined;

  try {
    console.log(`network=${NETWORK} wallet-api=${WALLET_API_URL}`);

    console.log(`\n--- bot wallet @${botNametag} ---`);
    bot = await initWallet({ nametag: botNametag, deviceId: `e2e-bot-${suffix()}`, root: join(root, 'bot') });
    const wallet = new BotWallet({
      sphere: bot,
      nametag: botNametag,
      coinSymbol: COIN_SYMBOL,
      targetBalance: 1000,
      minBalance: 100,
      tag: '[e2e:bot]',
    });

    // Funds the bot from zero — also the live exercise of payments.mint().
    //
    // Do NOT trust ensureBalance()'s return value here. It reads the balance
    // the instant mint() resolves, but a freshly minted token is not confirmed
    // yet, so on a brand-new wallet it reports 0 and returns false even though
    // the mint succeeded. Harmless in the bot (startup logs it and moves on;
    // sendReward ignores the result and lets send() enforce funds), but this
    // script must wait for the funds to actually settle before it can prove
    // anything about a payout.
    await wallet.ensureBalance();
    let funded = await confirmedBalance(bot);
    const fundDeadline = Date.now() + DELIVERY_TIMEOUT_MS;
    while (funded < REWARD && Date.now() < fundDeadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      funded = await confirmedBalance(bot);
      console.log(`  waiting for mint to confirm: ${funded} ${COIN_SYMBOL}`);
    }
    if (funded < REWARD) {
      console.error(
        `FAIL: bot wallet only reached ${funded} ${COIN_SYMBOL}, need ${REWARD} — cannot test a payout`,
      );
      return 1;
    }
    console.log(`bot funded: ${funded} ${COIN_SYMBOL}`);

    console.log(`\n--- recipient wallet @${winnerNametag} ---`);
    winner = await initWallet({
      nametag: winnerNametag,
      deviceId: `e2e-winner-${suffix()}`,
      root: join(root, 'winner'),
    });
    const before = await confirmedBalance(winner);
    console.log(`recipient starting balance: ${before} ${COIN_SYMBOL}`);

    console.log(`\n--- sendReward(): the call handleGameEnd() makes on a loss ---`);
    const result = await wallet.sendReward(`@${winnerNametag}`, REWARD, 'unichess reward e2e');
    console.log('sendReward reported:', JSON.stringify(result));
    if (!result.ok) {
      console.error(`FAIL: sendReward failed — ${result.error}`);
      return 1;
    }

    // Delivery is asynchronous (mailbox deposit -> claim), so poll rather than
    // trusting the ok above.
    console.log('\n--- polling recipient balance ---');
    const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
    let after = before;
    while (Date.now() < deadline && after <= before) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      await winner.payments.receive().catch(() => {});
      after = await confirmedBalance(winner);
      console.log(`  balance = ${after} ${COIN_SYMBOL}`);
    }

    const delta = after - before;
    console.log('\n=========== RESULT ===========');
    console.log(`expected delta : ${REWARD} ${COIN_SYMBOL}`);
    console.log(`actual delta   : ${delta} ${COIN_SYMBOL}`);

    if (delta === REWARD) {
      console.log('PASS — reward delivered; the full payout path works.');
      return 0;
    }
    console.error(
      delta > 0
        ? 'FAIL — unexpected amount delivered.'
        : 'FAIL — nothing delivered. May be an open intent still awaiting resume;\n' +
            '       check the journal dir before assuming the send was lost.',
    );
    return 1;
  } finally {
    await bot?.destroy().catch(() => {});
    await winner?.destroy().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('e2e crashed:', err);
    process.exit(1);
  });
