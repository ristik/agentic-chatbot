import { z } from 'zod';

export const LLMConfigSchema = z.object({
    provider: z.enum(['gemini', 'openai-compatible']),
    model: z.string(),
    baseUrl: z.string().optional(), // For OpenAI-compatible
    apiKey: z.string().optional(),
    temperature: z.number().default(0.7),
});

export const McpServerConfigSchema = z.object({
    name: z.string(),
    url: z.string(),
    apiKey: z.string().optional(),
});

export const ActivityConfigSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    systemPrompt: z.string(),
    greetingMessage: z.string().optional(),
    llm: LLMConfigSchema,
    mcpServers: z.array(McpServerConfigSchema),
    localTools: z.array(z.string()),
    theme: z.object({
        primaryColor: z.string(),
        name: z.string(),
    }).optional(),
    persistChatHistory: z.boolean().default(true).optional(),
    // Message history limits (0 = no limit)
    maxHistoryBytes: z.number().default(30000).optional(), // Default ~7-8k tokens
    maxHistoryMessages: z.number().default(0).optional(), // 0 = no message count limit, 1 = only latest, etc.
    // Reference processing: converts 【ref:id】 markers to clickable links using tool result URLs
    processReferences: z.boolean().default(false).optional(),
});

export type ActivityConfig = z.infer<typeof ActivityConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
