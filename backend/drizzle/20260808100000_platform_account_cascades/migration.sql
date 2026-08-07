-- Platform account deletion cascades
-- Deletes/interviews/notes/resumes/bookmarks flow with their parents; removed
-- users no longer block on postings/notes (postings keep NULL author).

ALTER TABLE public.candidate_bookmarks
  DROP CONSTRAINT IF EXISTS "candidate_bookmarks_g51nMlw5YP98_fkey",
  ADD CONSTRAINT "candidate_bookmarks_g51nMlw5YP98_fkey"
    FOREIGN KEY (candidate_account_id) REFERENCES public.candidate_accounts(id)
    ON DELETE CASCADE;

ALTER TABLE public.interview_feedbacks
  DROP CONSTRAINT IF EXISTS interview_feedbacks_interview_id_interviews_id_fkey,
  ADD CONSTRAINT interview_feedbacks_interview_id_interviews_id_fkey
    FOREIGN KEY (interview_id) REFERENCES public.interviews(id)
    ON DELETE CASCADE;

ALTER TABLE public.interviews
  DROP CONSTRAINT IF EXISTS interviews_application_id_applications_id_fkey,
  ADD CONSTRAINT interviews_application_id_applications_id_fkey
    FOREIGN KEY (application_id) REFERENCES public.applications(id)
    ON DELETE CASCADE;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_application_id_applications_id_fkey,
  ADD CONSTRAINT notes_application_id_applications_id_fkey
    FOREIGN KEY (application_id) REFERENCES public.applications(id)
    ON DELETE CASCADE;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_author_user_id_users_id_fkey,
  ADD CONSTRAINT notes_author_user_id_users_id_fkey
    FOREIGN KEY (author_user_id) REFERENCES public.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.job_postings
  DROP CONSTRAINT IF EXISTS job_postings_created_by_user_id_users_id_fkey,
  ADD CONSTRAINT job_postings_created_by_user_id_users_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public.users(id)
    ON DELETE SET NULL;

-- Note: resumes/resume_skills were dropped by 20260804101500_candidate_profile_redesign
-- (replaced by candidate_accounts.resume_file_url), so they exist in no schema.

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'template' OR nspname LIKE 'tenant_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.interview_feedbacks DROP CONSTRAINT IF EXISTS interview_feedbacks_interview_id_interviews_id_fkey', schema_name);
    EXECUTE format('ALTER TABLE %I.interview_feedbacks ADD CONSTRAINT interview_feedbacks_interview_id_interviews_id_fkey FOREIGN KEY (interview_id) REFERENCES %I.interviews(id) ON DELETE CASCADE', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.interviews DROP CONSTRAINT IF EXISTS interviews_application_id_applications_id_fkey', schema_name);
    EXECUTE format('ALTER TABLE %I.interviews ADD CONSTRAINT interviews_application_id_applications_id_fkey FOREIGN KEY (application_id) REFERENCES %I.applications(id) ON DELETE CASCADE', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.notes DROP CONSTRAINT IF EXISTS notes_application_id_applications_id_fkey', schema_name);
    EXECUTE format('ALTER TABLE %I.notes ADD CONSTRAINT notes_application_id_applications_id_fkey FOREIGN KEY (application_id) REFERENCES %I.applications(id) ON DELETE CASCADE', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.notes DROP CONSTRAINT IF EXISTS notes_author_user_id_users_id_fkey', schema_name);
    EXECUTE format('ALTER TABLE %I.notes ADD CONSTRAINT notes_author_user_id_users_id_fkey FOREIGN KEY (author_user_id) REFERENCES %I.users(id) ON DELETE CASCADE', schema_name, schema_name);
    EXECUTE format('ALTER TABLE %I.job_postings DROP CONSTRAINT IF EXISTS job_postings_created_by_user_id_users_id_fkey', schema_name);
    EXECUTE format('ALTER TABLE %I.job_postings ADD CONSTRAINT job_postings_created_by_user_id_users_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES %I.users(id) ON DELETE SET NULL', schema_name, schema_name);
  END LOOP;
END $$;
