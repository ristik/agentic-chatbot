CREATE TABLE IF NOT EXISTS "user_memory" (
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_memory_user_id_activity_id_key_pk" PRIMARY KEY("user_id","activity_id","key")
);
