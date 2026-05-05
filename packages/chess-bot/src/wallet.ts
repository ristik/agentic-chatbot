import { Sphere, TokenRegistry, toSmallestUnit } from '@unicitylabs/sphere-sdk';

const UCT_COIN_ID_FALLBACK =
  '455ad8720656b08e8dbd5bac1f3c73eeea5431565f6c1c3af742b1aa12d41d89';
const UCT_DECIMALS_FALLBACK = 18;
const TOPUP_POLL_INTERVAL_MS = 3_000;
const TOPUP_POLL_MAX_ATTEMPTS = 40;

export interface BotWalletOptions {
  sphere: Sphere;
  nametag: string;
  coinSymbol: string;
  faucetUrl: string;
  /** Total balance the wallet aims for after a top-up (whole UCT). */
  targetBalance: number;
  /** Minimum balance below which top-up is triggered (whole UCT). */
  minBalance: number;
  tag?: string;
}

interface AssetSummary {
  readonly coinId: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalAmount: string;
  readonly confirmedAmount: string;
}

export class BotWallet {
  private readonly sphere: Sphere;
  private readonly nametag: string;
  private readonly coinSymbol: string;
  private readonly faucetUrl: string;
  private readonly targetBalance: number;
  private readonly minBalance: number;
  private readonly tag: string;
  private cachedCoinId: string | null = null;
  private cachedDecimals: number | null = null;
  private topUpInFlight: Promise<boolean> | null = null;

  constructor(opts: BotWalletOptions) {
    this.sphere = opts.sphere;
    this.nametag = opts.nametag.replace(/^@/, '');
    this.coinSymbol = opts.coinSymbol;
    this.faucetUrl = opts.faucetUrl;
    this.targetBalance = opts.targetBalance;
    this.minBalance = opts.minBalance;
    this.tag = opts.tag ?? '[bot-wallet]';

    if (!Number.isFinite(this.targetBalance) || this.targetBalance <= 0) {
      throw new Error(`Invalid targetBalance ${opts.targetBalance}`);
    }
    if (!Number.isFinite(this.minBalance) || this.minBalance < 0) {
      throw new Error(`Invalid minBalance ${opts.minBalance}`);
    }
    if (this.minBalance >= this.targetBalance) {
      throw new Error(`minBalance must be less than targetBalance`);
    }
  }

  async getCoinId(): Promise<string> {
    if (this.cachedCoinId) return this.cachedCoinId;
    try {
      await TokenRegistry.waitForReady(5_000);
      const id = TokenRegistry.getInstance().getCoinIdBySymbol(this.coinSymbol);
      if (id) {
        this.cachedCoinId = id;
        return id;
      }
    } catch (err) {
      console.warn(`${this.tag} coinId registry lookup failed: ${err}`);
    }
    this.cachedCoinId = UCT_COIN_ID_FALLBACK;
    return this.cachedCoinId;
  }

  async getDecimals(): Promise<number> {
    if (this.cachedDecimals != null) return this.cachedDecimals;
    const coinId = await this.getCoinId();
    try {
      const def = TokenRegistry.getInstance().getDefinition(coinId);
      if (def && typeof def.decimals === 'number') {
        this.cachedDecimals = def.decimals;
        return def.decimals;
      }
    } catch {
      // fall through
    }
    this.cachedDecimals = UCT_DECIMALS_FALLBACK;
    return this.cachedDecimals;
  }

  /**
   * Read the wallet's confirmed UCT balance as a whole-UCT number.
   * Truncates fractional units (sufficient precision for top-up decisions).
   */
  async getBalanceUct(): Promise<number> {
    const coinId = await this.getCoinId();
    const decimals = await this.getDecimals();
    const assets = this.sphere.payments.getBalance(coinId) as AssetSummary[];
    const asset = assets.find((a) => a.coinId === coinId);
    if (!asset) return 0;
    return Number(BigInt(asset.confirmedAmount) / 10n ** BigInt(decimals));
  }

  /**
   * If balance falls under {@link minBalance}, request enough UCT from the faucet
   * to bring the balance up to {@link targetBalance}. De-duplicates concurrent calls.
   */
  async ensureBalance(): Promise<boolean> {
    if (this.topUpInFlight) return this.topUpInFlight;
    this.topUpInFlight = this.runEnsureBalance().finally(() => {
      this.topUpInFlight = null;
    });
    return this.topUpInFlight;
  }

  private async runEnsureBalance(): Promise<boolean> {
    const before = await this.getBalanceUct();
    if (before >= this.minBalance) {
      console.log(`${this.tag} balance ok: ${before} ${this.coinSymbol} (>= ${this.minBalance})`);
      return true;
    }

    const requested = Math.max(1, Math.ceil(this.targetBalance - before));
    console.log(
      `${this.tag} balance low: ${before} ${this.coinSymbol} < ${this.minBalance}. Requesting ${requested} from faucet for @${this.nametag}`,
    );

    const ok = await this.callFaucet(requested);
    if (!ok) {
      console.error(`${this.tag} faucet request failed`);
      return false;
    }

    // Faucet confirms async — wait for the transfer to settle in our wallet.
    const targetSmallest = await this.toSmallest(this.minBalance);
    for (let attempt = 1; attempt <= TOPUP_POLL_MAX_ATTEMPTS; attempt++) {
      try {
        await this.sphere.payments.receive({ finalize: true });
      } catch (err) {
        console.warn(`${this.tag} receive() failed (attempt ${attempt}): ${err}`);
      }
      const coinId = await this.getCoinId();
      const assets = this.sphere.payments.getBalance(coinId) as AssetSummary[];
      const asset = assets.find((a) => a.coinId === coinId);
      const total = asset ? BigInt(asset.totalAmount) : 0n;
      if (total >= targetSmallest) {
        const after = await this.getBalanceUct();
        console.log(`${this.tag} balance after top-up: ${after} ${this.coinSymbol}`);
        return true;
      }
      await sleep(TOPUP_POLL_INTERVAL_MS);
    }

    console.error(
      `${this.tag} top-up did not settle after ${TOPUP_POLL_MAX_ATTEMPTS * TOPUP_POLL_INTERVAL_MS / 1000}s`,
    );
    return false;
  }

  /**
   * Send {@link amountUct} whole UCT to the recipient (nametag with '@' prefix,
   * pubkey, or address).
   */
  async sendReward(
    recipient: string,
    amountUct: number,
    memo?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!recipient) return { ok: false, error: 'no recipient' };
    if (!Number.isFinite(amountUct) || amountUct <= 0) {
      return { ok: false, error: `invalid amount ${amountUct}` };
    }

    const coinId = await this.getCoinId();
    const smallest = await this.toSmallest(amountUct);

    const balance = await this.getBalanceUct();
    if (balance < amountUct) {
      // Try a top-up before giving up.
      console.log(
        `${this.tag} balance ${balance} < reward ${amountUct}, attempting top-up before send`,
      );
      await this.ensureBalance();
    }

    try {
      const result = await this.sphere.payments.send({
        recipient,
        amount: smallest.toString(),
        coinId,
        ...(memo ? { memo } : {}),
      });
      console.log(
        `${this.tag} reward sent: ${amountUct} ${this.coinSymbol} → ${recipient} (id=${result.id}, status=${result.status})`,
      );
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${this.tag} reward send failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  private async toSmallest(amountUct: number): Promise<bigint> {
    const decimals = await this.getDecimals();
    return toSmallestUnit(amountUct.toString(), decimals);
  }

  private async callFaucet(amount: number): Promise<boolean> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(this.faucetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unicityId: this.nametag,
            coin: 'unicity',
            amount,
          }),
        });
        if (response.ok) return true;
        const text = await response.text().catch(() => '');
        console.warn(
          `${this.tag} faucet HTTP ${response.status} (attempt ${attempt}): ${text.slice(0, 200)}`,
        );
      } catch (err) {
        console.warn(`${this.tag} faucet error (attempt ${attempt}): ${err}`);
      }
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
