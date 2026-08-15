DROP SCHEMA IF EXISTS template CASCADE;
CREATE SCHEMA template;
CREATE TABLE template."users" (LIKE public."users" INCLUDING ALL);
ALTER TABLE template."users" ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE template."users" ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
CREATE TABLE template."job_postings" (LIKE public."job_postings" INCLUDING ALL);
ALTER TABLE template."job_postings"
  ADD CONSTRAINT job_postings_created_by_user_id_users_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES template."users"("id")
    ON DELETE SET NULL;
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
ALTER TABLE template."interviews"
  ADD CONSTRAINT interviews_application_id_applications_id_fkey
    FOREIGN KEY (application_id) REFERENCES template."applications"("id")
    ON DELETE CASCADE;
CREATE TABLE template."interview_feedbacks" (LIKE public."interview_feedbacks" INCLUDING ALL);
ALTER TABLE template."interview_feedbacks"
  ADD CONSTRAINT interview_feedbacks_interview_id_interviews_id_fkey
    FOREIGN KEY (interview_id) REFERENCES template."interviews"("id")
    ON DELETE CASCADE;
CREATE TABLE template."notes" (LIKE public."notes" INCLUDING ALL);
ALTER TABLE template."notes"
  ADD CONSTRAINT notes_application_id_applications_id_fkey
    FOREIGN KEY (application_id) REFERENCES template."applications"("id")
    ON DELETE CASCADE;
ALTER TABLE template."notes"
  ADD CONSTRAINT notes_author_user_id_users_id_fkey
    FOREIGN KEY (author_user_id) REFERENCES template."users"("id")
    ON DELETE CASCADE;
CREATE TABLE template."permission_presets" (LIKE public."permission_presets" INCLUDING ALL);
