CREATE TABLE "monthly_closings" (
	"month" date PRIMARY KEY NOT NULL,
	"income_items" jsonb NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
