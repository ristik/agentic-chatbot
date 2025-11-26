import { pgTable, text, timestamp, primaryKey, jsonb } from 'drizzle-orm/pg-core';

export const userMemory = pgTable('user_memory', {
    userId: text('user_id').notNull(),
    activityId: text('activity_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.activityId, table.key] }),
}));

export type UserMemory = typeof userMemory.$inferSelect;
