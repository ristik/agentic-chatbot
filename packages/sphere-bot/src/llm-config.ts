import type { SphereBotConfig } from './types.js';

type LlmConfig = SphereBotConfig['llm'];
type Provider = LlmConfig['provider'];

const PROVIDERS: readonly Provider[] = ['google', 'openai-compatible'];

export interface LlmDefaults {
  /** Default provider when `${PREFIX}_LLM_PROVIDER` is unset. */
  provider?: Provider;
  /** Default model when `${PREFIX}_LLM_MODEL` is unset. */
  model?: string;
  /** Default base URL when `${PREFIX}_LLM_BASE_URL` is unset. */
  baseUrl?: string;
  /** Default temperature when `${PREFIX}_LLM_TEMPERATURE` is unset. Leave
   *  undefined to fall through to the model/SDK default (no temperature sent). */
  temperature?: number;
  /** Throw if `${PREFIX}_LLM_API_KEY` is unset — for bots with no fallback key. */
  requireApiKey?: boolean;
}

/**
 * Resolve a bot's LLM config from `${PREFIX}_LLM_*` env vars, falling back to
 * `defaults`. Every field — provider, model, apiKey, baseUrl, temperature — is
 * env-overridable, so switching a bot's LLM backend is a host `.env` change,
 * not a code change + rebuild. Fails fast (throws) on an unknown provider or a
 * non-numeric temperature rather than failing opaquely at request time.
 */
export function resolveLlmConfig(prefix: string, defaults: LlmDefaults = {}): LlmConfig {
  const env = (key: string): string | undefined => process.env[`${prefix}_LLM_${key}`];

  const provider = (env('PROVIDER') || defaults.provider || 'openai-compatible') as Provider;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`${prefix}_LLM_PROVIDER must be one of: ${PROVIDERS.join(', ')} (got "${provider}")`);
  }

  const model = env('MODEL') || defaults.model;
  if (!model) {
    throw new Error(`${prefix}_LLM_MODEL is required (no built-in default for this bot)`);
  }

  const apiKey = env('API_KEY') ?? '';
  if (defaults.requireApiKey && !apiKey) {
    throw new Error(`${prefix}_LLM_API_KEY environment variable is required`);
  }

  const baseUrl = env('BASE_URL') || defaults.baseUrl;

  // Presence check, NOT truthiness: temperature 0 is a valid, meaningful value
  // (deterministic output), so `Number(env) || default` would wrongly drop it.
  let temperature = defaults.temperature;
  const rawTemp = env('TEMPERATURE');
  if (rawTemp !== undefined && rawTemp !== '') {
    const parsed = Number(rawTemp);
    if (Number.isNaN(parsed)) {
      throw new Error(`${prefix}_LLM_TEMPERATURE must be a number (got "${rawTemp}")`);
    }
    temperature = parsed;
  }

  return {
    provider,
    model,
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
  };
}
