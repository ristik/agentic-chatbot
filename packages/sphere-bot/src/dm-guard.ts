export interface DmGuardOptions {
  /** Sender pubkeys (64-char hex) and/or @nametags to always drop. */
  blocklist?: string[];
  /** Per-sender inbound rate limit. Omit or set maxPerWindow<=0 to disable. */
  rateLimit?: { maxPerWindow: number; windowMs: number };
  /** Min ms between repeated drop-logs for the same sender (default 60s) so a
   *  sustained flood doesn't also flood the logs. */
  logIntervalMs?: number;
}

export type DmDecision =
  | { allowed: true }
  | { allowed: false; reason: 'blocked' | 'rate-limited'; log: boolean };

/**
 * Inbound-DM gate: a static blocklist plus a per-sender sliding-window rate
 * limit. Both drops are meant to be handled SILENTLY by the caller (no reply) —
 * replying to a blocked/looping sender feeds bot-to-bot reply loops and burns
 * LLM tokens. State is in-memory (per process); that's sufficient because these
 * bots are single-instance.
 */
export class DmGuard {
  private readonly blockedPubkeys = new Set<string>();
  private readonly blockedNametags = new Set<string>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly logIntervalMs: number;
  private readonly hits = new Map<string, number[]>();
  private readonly lastLog = new Map<string, number>();
  private opsSinceSweep = 0;

  constructor(opts: DmGuardOptions = {}) {
    for (const raw of opts.blocklist ?? []) {
      const entry = (raw ?? '').trim();
      if (!entry) continue;
      if (/^[0-9a-fA-F]{64}$/.test(entry)) this.blockedPubkeys.add(entry.toLowerCase());
      else this.blockedNametags.add(entry.replace(/^@/, '').toLowerCase());
    }
    this.max = opts.rateLimit?.maxPerWindow ?? 0;
    this.windowMs = opts.rateLimit?.windowMs ?? 60_000;
    this.logIntervalMs = opts.logIntervalMs ?? 60_000;
  }

  private isBlocked(pubkey: string, nametag?: string): boolean {
    if (this.blockedPubkeys.has(pubkey.toLowerCase())) return true;
    if (nametag && this.blockedNametags.has(nametag.replace(/^@/, '').toLowerCase())) return true;
    return false;
  }

  /** True if this hit exceeds the limit. Records the hit only when allowed, so
   *  a sender gets at most `max` accepted messages per rolling window. */
  private overLimit(pubkey: string, now: number): boolean {
    if (this.max <= 0) return false;
    const key = pubkey.toLowerCase();
    const cutoff = now - this.windowMs;
    const prev = this.hits.get(key);
    const recent = prev ? prev.filter(t => t > cutoff) : [];
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return true;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return false;
  }

  /** Rate-limit the drop logging itself, per sender. */
  private shouldLog(pubkey: string, now: number): boolean {
    const key = pubkey.toLowerCase();
    if (now - (this.lastLog.get(key) ?? 0) >= this.logIntervalMs) {
      this.lastLog.set(key, now);
      return true;
    }
    return false;
  }

  /** Occasionally drop expired bookkeeping so the maps don't grow unbounded
   *  with one-off senders over a long-lived process. */
  private sweep(now: number): void {
    if (++this.opsSinceSweep < 1000) return;
    this.opsSinceSweep = 0;
    const cutoff = now - this.windowMs;
    for (const [key, arr] of this.hits) {
      const recent = arr.filter(t => t > cutoff);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
    for (const [key, t] of this.lastLog) {
      if (now - t > this.logIntervalMs * 10) this.lastLog.delete(key);
    }
  }

  check(pubkey: string, nametag: string | undefined, now: number): DmDecision {
    this.sweep(now);
    if (this.isBlocked(pubkey, nametag)) {
      return { allowed: false, reason: 'blocked', log: this.shouldLog(pubkey, now) };
    }
    if (this.overLimit(pubkey, now)) {
      return { allowed: false, reason: 'rate-limited', log: this.shouldLog(pubkey, now) };
    }
    return { allowed: true };
  }
}

export interface RateLimit {
  maxPerWindow: number;
  windowMs: number;
}

/**
 * Resolve a per-sender rate limit from `${PREFIX}_RATE_LIMIT_MAX` (message
 * count) and `${PREFIX}_RATE_LIMIT_WINDOW_SEC` (window, in seconds), falling
 * back to `defaults`. Lets ops tune the limit from the host .env with no
 * rebuild. Fails fast on a non-integer / out-of-range value; maxPerWindow 0
 * disables rate limiting.
 */
export function resolveRateLimit(prefix: string, defaults: RateLimit): RateLimit {
  const parse = (name: string, min: number): number | undefined => {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) {
      throw new Error(`${name} must be an integer >= ${min} (got "${raw}")`);
    }
    return n;
  };
  const max = parse(`${prefix}_RATE_LIMIT_MAX`, 0);
  const windowSec = parse(`${prefix}_RATE_LIMIT_WINDOW_SEC`, 1);
  return {
    maxPerWindow: max ?? defaults.maxPerWindow,
    windowMs: windowSec !== undefined ? windowSec * 1000 : defaults.windowMs,
  };
}
