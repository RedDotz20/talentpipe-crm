-- Candidate application detail and database-enforced duplicate boundary.
ALTER TABLE public."applications"
  ADD COLUMN IF NOT EXISTS "cover_letter" TEXT;

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
      'ALTER TABLE %I.applications ADD COLUMN IF NOT EXISTS cover_letter TEXT',
      schema_name
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_candidate_application"
  ON public."candidate_applications_index"
  ("candidate_account_id", "tenant_id", "job_posting_id");
