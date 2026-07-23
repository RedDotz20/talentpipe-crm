CREATE TABLE "candidate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_applications_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"candidate_account_id" uuid NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"job_title" varchar(255) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"status" varchar(50) NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"candidate_account_id" uuid NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"job_title" varchar(255) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_listings_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" varchar(36) NOT NULL,
	"job_posting_id" uuid NOT NULL UNIQUE,
	"title" varchar(255) NOT NULL,
	"description" text,
	"company_name" varchar(255) NOT NULL,
	"company_slug" varchar(100) NOT NULL,
	"status" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_candidate_applications_account" ON "candidate_applications_index" ("candidate_account_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_applications_tenant_job" ON "candidate_applications_index" ("tenant_id","job_posting_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_bookmarks_account" ON "candidate_bookmarks" ("candidate_account_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_bookmarks_tenant_job" ON "candidate_bookmarks" ("tenant_id","job_posting_id");--> statement-breakpoint
CREATE INDEX "idx_job_listings_status" ON "job_listings_index" ("status");--> statement-breakpoint
CREATE INDEX "idx_job_listings_company" ON "job_listings_index" ("company_name");--> statement-breakpoint
CREATE INDEX "idx_job_listings_tenant" ON "job_listings_index" ("tenant_id");--> statement-breakpoint
ALTER TABLE "candidate_applications_index" ADD CONSTRAINT "candidate_applications_index_uYdiuY2jVa7F_fkey" FOREIGN KEY ("candidate_account_id") REFERENCES "candidate_accounts"("id");--> statement-breakpoint
ALTER TABLE "candidate_bookmarks" ADD CONSTRAINT "candidate_bookmarks_g51nMlw5YP98_fkey" FOREIGN KEY ("candidate_account_id") REFERENCES "candidate_accounts"("id");