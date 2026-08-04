-- Candidate Profile Redesign Migration
-- Adds UUID link between candidate_accounts and tenant candidates
-- Adds resume fields to candidate_accounts
-- Adds snapshot columns to applications
-- Removes resumes and resume_skills tables

-- Add resume columns to candidate_accounts (public schema)
ALTER TABLE candidate_accounts 
  ADD COLUMN IF NOT EXISTS resume_file_url VARCHAR(512),
  ADD COLUMN IF NOT EXISTS resume_uploaded_at TIMESTAMP WITH TIME ZONE;

-- Apply tenant changes to the template and all already-provisioned tenants.
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'template' OR nspname LIKE 'tenant_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.candidates ADD COLUMN IF NOT EXISTS candidate_account_id UUID REFERENCES public.candidate_accounts(id) ON DELETE SET NULL',
      schema_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_candidates_account ON %I.candidates(candidate_account_id)',
      schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.applications
         ADD COLUMN IF NOT EXISTS candidate_name VARCHAR(255),
         ADD COLUMN IF NOT EXISTS candidate_email VARCHAR(255),
         ADD COLUMN IF NOT EXISTS candidate_phone VARCHAR(50),
         ADD COLUMN IF NOT EXISTS applied_skill_ids JSONB',
      schema_name
    );
    EXECUTE format('DROP TABLE IF EXISTS %I.resume_skills CASCADE', schema_name);
    EXECUTE format('DROP TABLE IF EXISTS %I.resumes CASCADE', schema_name);
  END LOOP;
END $$;
