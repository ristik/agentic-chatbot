import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ChatRequestSchema } from '@agentic/shared';
import { runAgentStream } from '../agent/loop.js';
import { getActivityConfig } from '../config/activities/index.js';
import { randomUUID } from 'crypto';

export const chatRouter = new Hono();

chatRouter.post('/stream', async (c) => {
    const requestId = randomUUID(); // Add correlation ID
    console.log(`[Request ${requestId}] Starting chat stream request`);

    const body = await c.req.json();
    const parseResult = ChatRequestSchema.safeParse(body);

    if (!parseResult.success) {
        console.error(`[Request ${requestId}] Invalid request schema:`, parseResult.error);
        return c.json({ error: 'Invalid request', details: parseResult.error }, 400);
    }

    const { activityId, userId, messages, userContext, memoryState } = parseResult.data;
    console.log(`[Request ${requestId}] Activity: ${activityId}, User: ${userId}, Messages: ${messages.length}`);

    const activity = getActivityConfig(activityId);

    if (!activity) {
        console.error(`[Request ${requestId}] Unknown activity: ${activityId}`);
        return c.json({ error: 'Unknown activity' }, 404);
    }

    // Extract user IP for geolocation-based features
    const userIp = c.req.header('x-forwarded-for')?.split(',')[0].trim()
                 || c.req.header('x-real-ip')
                 || 'unknown';

    // TODO: Add IP-to-country lookup service if needed
    // For now, we can use a simple service or leave country detection to client
    const userCountry = c.req.header('cf-ipcountry'); // Cloudflare header if available

    console.log(`[Request ${requestId}] User IP: ${userIp}, Country: ${userCountry || 'unknown'}`);

    return streamSSE(c, async (stream) => {
        try {
            console.log(`[Request ${requestId}] Starting agent stream`);
            const agentStream = runAgentStream({
                activity,
                userId,
                messages,
                userIp,
                userCountry,
                userTimezone: userContext?.timezone,
                userLocale: userContext?.locale,
                memoryState, // Pass memory state from client to agent
            });

            let eventCount = 0;
            for await (const event of agentStream) {
                eventCount++;
                await stream.writeSSE({
                    event: event.type,
                    data: JSON.stringify(event),
                });
            }

            console.log(`[Request ${requestId}] Stream completed successfully. Total events: ${eventCount}`);
        } catch (error) {
            console.error(`[Request ${requestId}] ❌ Agent execution error`);
            console.error(`[Request ${requestId}] Error type:`, error instanceof Error ? error.constructor.name : typeof error);
            console.error(`[Request ${requestId}] Error message:`, error instanceof Error ? error.message : String(error));

            if (error instanceof Error && error.stack) {
                console.error(`[Request ${requestId}] Stack trace:`, error.stack);
            }

            console.error(`[Request ${requestId}] Activity: ${activityId}`);
            console.error(`[Request ${requestId}] User: ${userId}`);
            console.error(`[Request ${requestId}] Message count: ${messages.length}`);

            await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({
                    error: 'Agent execution failed',
                    requestId, // Include correlation ID in error
                }),
            });
        }
    });
});
