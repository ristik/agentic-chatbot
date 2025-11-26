import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ChatRequestSchema } from '@agentic/shared';
import { runAgentStream } from '../agent/loop.js';
import { getActivityConfig } from '../config/activities/index.js';

export const chatRouter = new Hono();

chatRouter.post('/stream', async (c) => {
    const body = await c.req.json();
    const parseResult = ChatRequestSchema.safeParse(body);

    if (!parseResult.success) {
        return c.json({ error: 'Invalid request', details: parseResult.error }, 400);
    }

    const { activityId, userId, messages } = parseResult.data;
    const activity = getActivityConfig(activityId);

    if (!activity) {
        return c.json({ error: 'Unknown activity' }, 404);
    }

    return streamSSE(c, async (stream) => {
        try {
            const agentStream = runAgentStream({ activity, userId, messages });

            for await (const event of agentStream) {
                await stream.writeSSE({
                    event: event.type,
                    data: JSON.stringify(event),
                });
            }
        } catch (error) {
            console.error('Agent error:', error);
            await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({ error: 'Agent execution failed' }),
            });
        }
    });
});
