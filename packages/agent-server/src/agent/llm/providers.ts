import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LLMConfig } from '@agentic/shared';

export function createLLMProvider(config: LLMConfig) {
    console.log('[Provider] Creating LLM provider:', config.provider, 'model:', config.model);

    switch (config.provider) {
        case 'gemini': {
            // Validate API key exists
            if (!process.env.GOOGLE_API_KEY) {
                const error = new Error('GOOGLE_API_KEY environment variable is not set');
                console.error('[Provider] Gemini API key missing');
                throw error;
            }

            // Validate model name
            if (!config.model || config.model.trim() === '') {
                const error = new Error('Model name is required for Gemini provider');
                console.error('[Provider] Invalid model configuration:', config);
                throw error;
            }

            try {
                console.log('[Provider] Initializing Gemini with model:', config.model);
                const google = createGoogleGenerativeAI({
                    apiKey: process.env.GOOGLE_API_KEY,
                });
                const model = google(config.model);
                console.log('[Provider] Gemini provider created successfully');
                return model;
            } catch (error) {
                console.error('[Provider] Failed to create Gemini provider:', error);
                console.error('[Provider] Config:', JSON.stringify(config));
                throw error;
            }
        }
        case 'openai-compatible': {
            // Validate base URL
            if (!config.baseUrl) {
                const error = new Error('baseUrl is required for openai-compatible provider');
                console.error('[Provider] Missing baseUrl in config:', config);
                throw error;
            }

            // Validate model name
            if (!config.model || config.model.trim() === '') {
                const error = new Error('Model name is required for OpenAI-compatible provider');
                console.error('[Provider] Invalid model configuration:', config);
                throw error;
            }

            try {
                console.log('[Provider] Initializing OpenAI-compatible provider:', config.baseUrl);
                const provider = createOpenAICompatible({
                    baseURL: config.baseUrl,
                    apiKey: config.apiKey || 'not-needed',
                    name: 'custom-llm',
                });
                const model = provider(config.model);
                console.log('[Provider] OpenAI-compatible provider created successfully');
                return model;
            } catch (error) {
                console.error('[Provider] Failed to create OpenAI-compatible provider:', error);
                console.error('[Provider] Config:', JSON.stringify(config));
                throw error;
            }
        }
        default: {
            const error = new Error(`Unknown LLM provider: ${config.provider}`);
            console.error('[Provider] Invalid provider configuration:', config);
            throw error;
        }
    }
}
