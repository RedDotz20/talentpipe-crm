CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"candidate_id" uuid NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"current_stage_id" uuid,
	"match_score" double precision DEFAULT 0,
	"applied_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"action" varchar(100) NOT NULL,
	"resource_id" varchar(36),
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"interview_id" uuid NOT NULL UNIQUE,
	"rating" integer,
	"comments" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"interviewer_id" uuid NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_required_skills" (
	"job_posting_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(100) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_skills" (
	"resume_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"candidate_id" uuid NOT NULL,
	"file_url" varchar(512),
	"parsed_text" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL UNIQUE,
	"category" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL UNIQUE,
	"plan" varchar(50) DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL UNIQUE,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'OrgAdmin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_applications_job_stage" ON "applications" ("job_posting_id","current_stage_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_action" ON "audit_logs" ("tenant_id","action");--> statement-breakpoint
CREATE INDEX "idx_candidates_email" ON "candidates" ("email");--> statement-breakpoint
CREATE INDEX "idx_interviews_interviewer" ON "interviews" ("interviewer_id");--> statement-breakpoint
CREATE INDEX "idx_interviews_application" ON "interviews" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_job_required_skills_unique" ON "job_required_skills" ("job_posting_id","skill_id");--> statement-breakpoint
CREATE INDEX "idx_notes_application" ON "notes" ("application_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_stages_order" ON "pipeline_stages" ("order");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_resume_skills_unique" ON "resume_skills" ("resume_id","skill_id");--> statement-breakpoint
CREATE INDEX "idx_resumes_candidate" ON "resumes" ("candidate_id");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_posting_id_job_postings_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_current_stage_id_pipeline_stages_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "pipeline_stages"("id");--> statement-breakpoint
ALTER TABLE "interview_feedbacks" ADD CONSTRAINT "interview_feedbacks_interview_id_interviews_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id");--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id");--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_users_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "job_required_skills" ADD CONSTRAINT "job_required_skills_job_posting_id_job_postings_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_application_id_applications_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_user_id_users_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "resume_skills" ADD CONSTRAINT "resume_skills_resume_id_resumes_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id");--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_candidate_id_candidates_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id");