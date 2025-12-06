import { tool } from 'ai';
import { z } from 'zod';

export interface ToolContext {
    userId: string;
    activityId: string;
    // Memory state from client's localStorage
    memoryState: Record<string, any>;
}

/**
 * Format memory state as human-readable text for system prompt injection
 * Returns undefined if no memory exists (so template {{else}} block can handle it)
 */
export function formatMemoryForPrompt(memoryState: Record<string, any>, userId: string): string | undefined {
    const entries = Object.entries(memoryState);

    if (entries.length === 0) {
        return undefined; // Let template's {{else}} block handle empty state
    }

    // Format preferences as readable text
    const formattedEntries = entries.map(([key, value]) => {
        const formattedValue = typeof value === 'object'
            ? JSON.stringify(value, null, 2)
            : String(value);
        return `  - ${key}: ${formattedValue}`;
    });

    return `User ${userId} has ${entries.length} stored preference(s):\n${formattedEntries.join('\n')}`;
}

/**
 * Creates a stateless memory tool that operates on the passed-in memoryState
 * All changes are made to the memoryState object, which will be returned to the client
 */
export function createMemoryTool(ctx: ToolContext) {
    const { userId, activityId, memoryState } = ctx;

    // Gemini requires array items to be explicitly typed (no z.any())
    // Support arrays of primitives and objects
    const arrayValueSchema = z.array(
        z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.record(z.string(), z.unknown()),
        ])
    );

    const memoryValueSchema = z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.record(z.string(), z.unknown()),
        arrayValueSchema,
    ]);

    return tool({
        description: `Store or retrieve user-specific information for personalization. Use this to remember user preferences, past choices, etc. across the sessions.

Actions:
- get: Retrieve a single value by key
- set: Store a value with a key
- list: Get all key-value pairs as structured data
- pull: Get all preferences formatted as human-readable text for context`,
        parameters: z.object({
            action: z.enum(['get', 'set', 'list', 'pull']).describe('Action to perform'),
            key: z.string().optional().describe('Memory key (required for get/set)'),
            value: memoryValueSchema.optional().describe('Value to store (required for set)'),
        }),
        execute: async ({ action, key, value }) => {
            switch (action) {
                case 'get': {
                    if (!key) return { error: 'Key required for get' };
                    const storedValue = memoryState[key];
                    return { key, value: storedValue ?? null };
                }

                case 'set': {
                    if (!key) return { error: 'Key required for set' };
                    memoryState[key] = value;
                    return { success: true, key };
                }

                case 'list': {
                    const memories = Object.entries(memoryState).map(([key, value]) => ({
                        key,
                        value,
                    }));
                    return { memories };
                }

                case 'pull': {
                    const entries = Object.entries(memoryState);
                    const summary = formatMemoryForPrompt(memoryState, userId);
                    return {
                        summary,
                        preferences: memoryState,
                        count: entries.length,
                    };
                }
            }
        },
    });
}
