DROP SCHEMA IF EXISTS template CASCADE;
CREATE SCHEMA template;
CREATE TABLE template."users" (LIKE public."users" INCLUDING ALL);
CREATE TABLE template."job_postings" (LIKE public."job_postings" INCLUDING ALL);
CREATE TABLE template."candidates" (LIKE public."candidates" INCLUDING ALL);
ALTER TABLE template."candidates"
  ADD COLUMN IF NOT EXISTS "candidate_account_id" UUID
    REFERENCES public."candidate_accounts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_candidates_account"
  ON template."candidates"("candidate_account_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_candidate_account"
  ON template."candidates"("candidate_account_id")
  WHERE "candidate_account_id" IS NOT NULL;
CREATE TABLE template."pipeline_stages" (LIKE public."pipeline_stages" INCLUDING ALL);
CREATE TABLE template."applications" (LIKE public."applications" INCLUDING ALL);
ALTER TABLE template."applications"
  ADD COLUMN IF NOT EXISTS "candidate_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "candidate_email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "candidate_phone" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "applied_skill_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "cover_letter" TEXT;
CREATE TABLE template."job_required_skills" (LIKE public."job_required_skills" INCLUDING ALL);
CREATE TABLE template."interviews" (LIKE public."interviews" INCLUDING ALL);
CREATE TABLE template."interview_feedbacks" (LIKE public."interview_feedbacks" INCLUDING ALL);
CREATE TABLE template."notes" (LIKE public."notes" INCLUDING ALL);
