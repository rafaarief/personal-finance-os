CREATE TYPE "public"."trade_currency" AS ENUM('IDR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."trade_market" AS ENUM('INDONESIA', 'US', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'TRADING_USER');--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text NOT NULL,
	"market" "trade_market" NOT NULL,
	"currency" "trade_currency" NOT NULL,
	"margin_amount" numeric(18, 2) NOT NULL,
	"buy_price" numeric(18, 4) NOT NULL,
	"sell_price" numeric(18, 4),
	"quantity" numeric(18, 4),
	"buy_date" date NOT NULL,
	"sell_date" date,
	"status" "trade_status" DEFAULT 'OPEN' NOT NULL,
	"strategy" text,
	"notes" text,
	"created_by" text NOT NULL,
	"last_edited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
