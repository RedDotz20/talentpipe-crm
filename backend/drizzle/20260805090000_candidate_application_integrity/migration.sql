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

-- For duplicate candidate/job applications, retain the earliest applied_at;
-- break equal timestamps by the smallest UUID id and remove only later rows.
WITH ranked_applications AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY candidate_account_id, tenant_id, job_posting_id
      ORDER BY applied_at ASC, id ASC
    ) AS application_rank
  FROM public."candidate_applications_index"
)
DELETE FROM public."candidate_applications_index" AS application_index
USING ranked_applications
WHERE application_index.id = ranked_applications.id
  AND ranked_applications.application_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_candidate_application"
  ON public."candidate_applications_index"
  ("candidate_account_id", "tenant_id", "job_posting_id");
