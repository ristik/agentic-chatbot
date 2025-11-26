import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { userMemory } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';

export interface ToolContext {
    userId: string;
    activityId: string;
}

export function createMemoryTool(ctx: ToolContext) {
    return tool({
        description: 'Store or retrieve user-specific information for personalization. Use this to remember user preferences, past choices, scores, etc.',
        parameters: z.object({
            action: z.enum(['get', 'set', 'list']).describe('Action to perform'),
            key: z.string().optional().describe('Memory key (required for get/set)'),
            value: z.any().optional().describe('Value to store (required for set)'),
        }),
        execute: async ({ action, key, value }) => {
            const { userId, activityId } = ctx;

            switch (action) {
                case 'get': {
                    if (!key) return { error: 'Key required for get' };
                    const result = await db.query.userMemory.findFirst({
                        where: and(
                            eq(userMemory.userId, userId),
                            eq(userMemory.activityId, activityId),
                            eq(userMemory.key, key)
                        ),
                    });
                    return result ? { key, value: result.value } : { key, value: null };
                }

                case 'set': {
                    if (!key) return { error: 'Key required for set' };
                    await db.insert(userMemory)
                        .values({ userId, activityId, key, value, updatedAt: new Date() })
                        .onConflictDoUpdate({
                            target: [userMemory.userId, userMemory.activityId, userMemory.key],
                            set: { value, updatedAt: new Date() },
                        });
                    return { success: true, key };
                }

                case 'list': {
                    const results = await db.query.userMemory.findMany({
                        where: and(
                            eq(userMemory.userId, userId),
                            eq(userMemory.activityId, activityId)
                        ),
                    });
                    return { memories: results.map(r => ({ key: r.key, value: r.value })) };
                }
            }
        },
    });
}
