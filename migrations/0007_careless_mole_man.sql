CREATE TABLE "payable_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creditor" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_value_snapshots" ADD COLUMN "category_at_date" "asset_category";--> statement-breakpoint
CREATE UNIQUE INDEX "payable_snapshots_creditor_date_idx" ON "payable_snapshots" USING btree ("creditor","snapshot_date");
--> statement-breakpoint
UPDATE asset_value_snapshots s SET category_at_date = a.category FROM assets a WHERE a.id = s.asset_id;
