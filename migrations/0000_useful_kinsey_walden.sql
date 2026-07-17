CREATE TYPE "public"."asset_category" AS ENUM('cash', 'investment', 'business', 'other');--> statement-breakpoint
CREATE TYPE "public"."bank_code" AS ENUM('bca', 'jago', 'bni', 'mandiri');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'parsing', 'parsed', 'reviewing', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."snapshot_source" AS ENUM('manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."source_file_type" AS ENUM('pdf', 'csv');--> statement-breakpoint
CREATE TYPE "public"."transfer_match_method" AS ENUM('amount_date_heuristic', 'manual');--> statement-breakpoint
CREATE TABLE "asset_value_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"current_value" numeric(16, 2) NOT NULL,
	"source" "snapshot_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "asset_category" NOT NULL,
	"subcategory" text NOT NULL,
	"name" text NOT NULL,
	"current_value" numeric(16, 2) NOT NULL,
	"purchase_value" numeric(16, 2),
	"currency" text DEFAULT 'IDR' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_code" "bank_code" NOT NULL,
	"account_name" text NOT NULL,
	"account_number_masked" text,
	"linked_asset_id" uuid,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "internal_transfer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_transaction_id" uuid NOT NULL,
	"to_transaction_id" uuid NOT NULL,
	"match_confidence" numeric(4, 3) NOT NULL,
	"match_method" "transfer_match_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"source_filename" text NOT NULL,
	"source_file_type" "source_file_type" NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"raw_extracted_json" jsonb,
	"statement_period_start" date,
	"statement_period_end" date,
	"total_extracted" integer DEFAULT 0 NOT NULL,
	"total_new" integer DEFAULT 0 NOT NULL,
	"total_duplicate" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"statement_import_id" uuid,
	"transaction_date" date NOT NULL,
	"description" text NOT NULL,
	"counterparty" text,
	"money_in" numeric(14, 2),
	"money_out" numeric(14, 2),
	"balance_after" numeric(14, 2),
	"category_id" uuid,
	"subcategory_id" uuid,
	"is_business" boolean DEFAULT false NOT NULL,
	"is_investment" boolean DEFAULT false NOT NULL,
	"is_internal_transfer" boolean DEFAULT false NOT NULL,
	"ai_confidence" numeric(4, 3),
	"ai_suggested_category_id" uuid,
	"reviewed_at" timestamp with time zone,
	"dedup_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_value_snapshots" ADD CONSTRAINT "asset_value_snapshots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_linked_asset_id_assets_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_links" ADD CONSTRAINT "internal_transfer_links_from_transaction_id_transactions_id_fk" FOREIGN KEY ("from_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_transfer_links" ADD CONSTRAINT "internal_transfer_links_to_transaction_id_transactions_id_fk" FOREIGN KEY ("to_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_statement_import_id_statement_imports_id_fk" FOREIGN KEY ("statement_import_id") REFERENCES "public"."statement_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ai_suggested_category_id_categories_id_fk" FOREIGN KEY ("ai_suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_value_snapshots_asset_date_idx" ON "asset_value_snapshots" USING btree ("asset_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_transfer_links_pair_idx" ON "internal_transfer_links" USING btree ("from_transaction_id","to_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subcategories_category_key_idx" ON "subcategories" USING btree ("category_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_bank_account_dedup_hash_idx" ON "transactions" USING btree ("bank_account_id","dedup_hash");--> statement-breakpoint
CREATE INDEX "transactions_transaction_date_idx" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_category_id_idx" ON "transactions" USING btree ("category_id");