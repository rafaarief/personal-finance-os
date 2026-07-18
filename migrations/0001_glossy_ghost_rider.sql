CREATE TABLE "financial_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_date" date NOT NULL,
	"net_worth" numeric(16, 2) NOT NULL,
	"highlights" jsonb NOT NULL,
	"summary" text NOT NULL,
	"recommendation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_reviews_review_date_unique" UNIQUE("review_date")
);
