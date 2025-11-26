import { Hono } from 'hono';
import { getAllActivities } from '../config/activities/index.js';

export const activitiesRouter = new Hono();

activitiesRouter.get('/', (c) => {
    const activities = getAllActivities();

    // Return only public info (not system prompts, API keys, etc.)
    const publicActivities = activities.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        greetingMessage: a.greetingMessage,
        theme: a.theme,
        persistChatHistory: a.persistChatHistory,
    }));

    return c.json({ activities: publicActivities });
});
