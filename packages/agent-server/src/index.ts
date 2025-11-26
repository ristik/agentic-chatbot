import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { chatRouter } from './routes/chat.js';
import { activitiesRouter } from './routes/activities.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));

// Routes
app.route('/chat', chatRouter);
app.route('/activities', activitiesRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

const port = parseInt(process.env.PORT || '3000');

serve({
    fetch: app.fetch,
    port,
});

console.log(`Agent server running on http://localhost:${port}`);
