import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { chatRouter } from './routes/chat.js';
import { activitiesRouter } from './routes/activities.js';

import { imagesRouter } from './routes/images.js';

const app = new Hono();

// Middleware
app.use('*', logger());

// Parse CORS origins from environment (comma-separated list)
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:5173'];

console.log('[CORS] Allowed origins:', corsOrigins);

// CORS for API routes (strict - requires Origin header)
app.use('/chat/*', cors({
    origin: (origin) => {
        if (!origin) {
            console.log('[CORS] Rejected for /chat/: No origin header');
            return corsOrigins[0];
        }
        const allowed = corsOrigins.includes(origin);
        return allowed ? origin : corsOrigins[0];
    },
    credentials: true,
}));

app.use('/activities/*', cors({
    origin: (origin) => {
        if (!origin) {
            return corsOrigins[0];
        }
        const allowed = corsOrigins.includes(origin);
        return allowed ? origin : corsOrigins[0];
    },
    credentials: true,
}));

// allow all origins for images
app.use('/images/*', cors({
    origin: '*',
    credentials: false,
}));

// Routes
app.route('/chat', chatRouter);
app.route('/activities', activitiesRouter);
app.route('/images', imagesRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

const port = parseInt(process.env.PORT || '3000');

serve({
    fetch: app.fetch,
    port,
});

console.log(`Agent server running on http://localhost:${port}`);
