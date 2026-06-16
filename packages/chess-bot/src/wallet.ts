import { Sphere, TokenRegistry, toSmallestUnit, isSphereError } from '@unicitylabs/sphere-sdk';

// testnet2 UCT coinId (unicity-ids.testnet2.json). Fallback only — the registry
// lookup (TokenRegistry.getCoinIdBySymbol) is preferred and authoritative.
const UCT_COIN_ID_FALLBACK =
  'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0';
const UCT_DECIMALS_FALLBACK = 18;

export interface BotWalletOptions {
  sphere: Sphere;
  nametag: string;
  coinSymbol: string;
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
        // Normalize to lowercase hex once, here — mintFungibleToken requires it
        // and getBalance()/asset.coinId are lowercase, so every consumer compares
        // and passes the same casing.
        this.cachedCoinId = id.toLowerCase();
        return this.cachedCoinId;
      }
    } catch (err) {
      console.warn(`${this.tag} coinId registry lookup failed: ${err}`);
    }
    this.cachedCoinId = UCT_COIN_ID_FALLBACK; // already lowercase
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
   * If balance falls under {@link minBalance}, self-mint enough UCT to bring the
   * balance up to {@link targetBalance}. De-duplicates concurrent calls.
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

    // On testnet2 the wallet starts empty and there is no faucet step: re-fund
    // from zero by SELF-MINTING via the v2 token engine. mintFungibleToken
    // produces a finished, confirmed token locally (no faucet HTTP, no mailbox
    // receive round-trip), so the balance is available as soon as it resolves.
    const requested = Math.max(1, Math.ceil(this.targetBalance - before));
    const coinId = await this.getCoinId(); // already lowercase-normalized
    const amount = await this.toSmallest(requested);
    console.log(
      `${this.tag} balance low: ${before} ${this.coinSymbol} < ${this.minBalance}. Self-minting ${requested} ${this.coinSymbol} for @${this.nametag}`,
    );

    try {
      const result = await this.sphere.payments.mintFungibleToken(coinId, amount);
      if (!result.success) {
        console.error(`${this.tag} self-mint failed: ${result.error}`);
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${this.tag} self-mint threw: ${msg}`);
      return false;
    }

    const after = await this.getBalanceUct();
    console.log(`${this.tag} balance after self-mint: ${after} ${this.coinSymbol}`);
    return after >= this.minBalance;
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
      // A recipient who has never published a chain pubkey is unsendable under
      // the v2 send gate — surface it clearly instead of as a generic failure.
      if (isSphereError(err) && err.code === 'INVALID_RECIPIENT') {
        const msg = `recipient ${recipient} has no published chain pubkey (unsendable)`;
        console.error(`${this.tag} reward send failed: ${msg}`);
        return { ok: false, error: msg };
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${this.tag} reward send failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  private async toSmallest(amountUct: number): Promise<bigint> {
    const decimals = await this.getDecimals();
    return toSmallestUnit(amountUct.toString(), decimals);
  }
}
