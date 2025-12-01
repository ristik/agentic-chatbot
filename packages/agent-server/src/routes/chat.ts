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

    // Extract user IP for geolocation-based features
    const userIp = c.req.header('x-forwarded-for')?.split(',')[0].trim()
                 || c.req.header('x-real-ip')
                 || 'unknown';

    // TODO: Add IP-to-country lookup service if needed
    // For now, we can use a simple service or leave country detection to client
    const userCountry = c.req.header('cf-ipcountry'); // Cloudflare header if available

    return streamSSE(c, async (stream) => {
        try {
            const agentStream = runAgentStream({
                activity,
                userId,
                messages,
                userIp,
                userCountry
            });

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
