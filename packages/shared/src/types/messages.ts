import { z } from 'zod';

export const MessageContentSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('image'), url: z.string(), alt: z.string().optional() }),
    z.object({
        type: z.literal('choice'),
        question: z.string(),
        options: z.array(z.object({ id: z.string(), label: z.string() })),
    }),
    z.object({
        type: z.literal('payment'),
        txData: z.record(z.unknown()),
        status: z.enum(['pending', 'confirmed', 'rejected']),
    }),
]);

export type MessageContent = z.infer<typeof MessageContentSchema>;

export const ChatMessageSchema = z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.array(MessageContentSchema),
    timestamp: z.number(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
    activityId: z.string(),
    userId: z.string(),
    messages: z.array(ChatMessageSchema),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
