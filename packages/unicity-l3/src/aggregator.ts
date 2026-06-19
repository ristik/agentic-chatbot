/** Human-readable shard label from a bft shard prefix.
 *  testnet2 shard ids are N-bit binary prefixes ("000".."111"); the decimal
 *  value of the prefix is the human shard number ("000" → "0", "111" → "7"). */
export function displayShardId(rawId: string): string {
  const n = parseInt(rawId, 2);
  return Number.isNaN(n) ? rawId : String(n);
}

export interface BlockData {
  index: number;
  shardId: string;
  totalCommitments: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AggregatorClient {
  private readonly baseUrl: string;
  private requestId = 0;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async fetchShardIds(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/config/shards`);
    if (!res.ok) throw new Error(`Failed to fetch shards: ${res.status}`);
    // testnet2 gateway: { version, mode: 'bft-shard', bftShardPrefixes: ['000', ...] }.
    // The prefix strings are the shardId values passed to get_block_height/get_block,
    // and are what displayShardId() decodes (base-2). testnet2-only — no legacy shape.
    const data = (await res.json()) as { bftShardPrefixes?: string[] };
    if (!Array.isArray(data.bftShardPrefixes)) {
      throw new Error('Unexpected /config/shards shape (no bftShardPrefixes)');
    }
    return data.bftShardPrefixes;
  }

  async getBlockHeight(shardId: string): Promise<number> {
    const result = await this.rpc('get_block_height', { shardId }) as { blockNumber: string };
    return parseInt(result.blockNumber);
  }

  async getBlock(blockNumber: number, shardId: string): Promise<BlockData> {
    const result = await this.rpc('get_block', {
      blockNumber: blockNumber.toString(),
      shardId,
    }) as { block?: { index: number; shardId: string }; totalCommitments?: string };
    return {
      index: result.block?.index ?? blockNumber,
      shardId: result.block?.shardId ?? shardId,
      totalCommitments: result.totalCommitments ? parseInt(result.totalCommitments) : 0,
    };
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    });

    // Retry transient failures (network errors / HTTP 5xx — e.g. the testnet2
    // gateway's intermittent 502s). 4xx and JSON-RPC errors are deterministic
    // and fail fast (marked _noRetry).
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.status >= 500) throw new Error(`RPC ${method} HTTP ${res.status}`);
        if (!res.ok) throw Object.assign(new Error(`RPC ${method} HTTP ${res.status}`), { _noRetry: true });
        const json = (await res.json()) as { result?: unknown; error?: { message: string } };
        if (json.error) throw Object.assign(new Error(`RPC ${method}: ${json.error.message}`), { _noRetry: true });
        return json.result;
      } catch (err) {
        lastErr = err;
        if ((err as { _noRetry?: boolean })?._noRetry || attempt === 3) throw err;
        await sleep(300 * attempt);
      }
    }
    throw lastErr;
  }
}
