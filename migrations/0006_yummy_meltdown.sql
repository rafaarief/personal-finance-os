CREATE TYPE "public"."change_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."change_entity" AS ENUM('asset', 'transaction', 'trade', 'bank_account', 'cash_adjustment');--> statement-breakpoint
CREATE TABLE "change_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "change_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"category" text,
	"action" "change_action" NOT NULL,
	"changes" jsonb NOT NULL,
	"label" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "change_logs_entity_idx" ON "change_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "change_logs_category_idx" ON "change_logs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "change_logs_changed_at_idx" ON "change_logs" USING btree ("changed_at");