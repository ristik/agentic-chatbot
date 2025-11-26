import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LLMConfig } from '@agentic/shared';

export function createLLMProvider(config: LLMConfig) {
    switch (config.provider) {
        case 'gemini': {
            const google = createGoogleGenerativeAI({
                apiKey: process.env.GOOGLE_API_KEY!,
            });
            return google(config.model);
        }
        case 'openai-compatible': {
            const provider = createOpenAICompatible({
                baseURL: config.baseUrl!,
                apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || 'not-needed',
                name: 'custom-llm',
            });
            return provider(config.model);
        }
        default:
            throw new Error(`Unknown LLM provider: ${config.provider}`);
    }
}
