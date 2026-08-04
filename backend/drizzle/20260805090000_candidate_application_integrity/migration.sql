-- Candidate application detail and database-enforced duplicate boundaries.
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
      'ALTER TABLE %I."applications" ADD COLUMN IF NOT EXISTS "cover_letter" TEXT',
      schema_name
    );
  END LOOP;
END $$;

-- A candidate account may have been linked to more than one tenant candidate
-- before the unique boundary existed. Keep the earliest row and repoint all
-- tenant applications before deleting the duplicate candidate rows.
DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'template' OR nspname LIKE 'tenant_%'
  LOOP
    EXECUTE format($repoint$
      WITH ranked_candidates AS (
        SELECT
          id,
          first_value(id) OVER (
            PARTITION BY candidate_account_id
            ORDER BY created_at ASC, id ASC
          ) AS retained_id,
          row_number() OVER (
            PARTITION BY candidate_account_id
            ORDER BY created_at ASC, id ASC
          ) AS candidate_rank
        FROM %I."candidates"
        WHERE candidate_account_id IS NOT NULL
      )
      UPDATE %I."applications" AS application_row
      SET candidate_id = ranked_candidates.retained_id
      FROM ranked_candidates
      WHERE application_row.candidate_id = ranked_candidates.id
        AND ranked_candidates.candidate_rank > 1;
    $repoint$, schema_name, schema_name);

    EXECUTE format($delete_candidates$
      WITH ranked_candidates AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY candidate_account_id
            ORDER BY created_at ASC, id ASC
          ) AS candidate_rank
        FROM %I."candidates"
        WHERE candidate_account_id IS NOT NULL
      )
      DELETE FROM %I."candidates" AS candidate_row
      USING ranked_candidates
      WHERE candidate_row.id = ranked_candidates.id
        AND ranked_candidates.candidate_rank > 1;
    $delete_candidates$, schema_name, schema_name);

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS "unique_candidate_account" ON %I."candidates" ("candidate_account_id") WHERE "candidate_account_id" IS NOT NULL',
      schema_name
    );
  END LOOP;
END $$;

-- Reconcile duplicate public index rows with their tenant application data
-- before enforcing the public candidate/job uniqueness boundary. The public
-- row with the earliest applied_at (then smallest id) remains authoritative.
DO $$
DECLARE
  duplicate_row RECORD;
  tenant_schema TEXT;
BEGIN
  FOR duplicate_row IN
    SELECT
      ranked.id,
      ranked.tenant_id,
      ranked.application_id,
      ranked.retained_application_id
    FROM (
      SELECT
        application_index.*,
        first_value(application_index.application_id) OVER (
          PARTITION BY application_index.candidate_account_id,
            application_index.tenant_id,
            application_index.job_posting_id
          ORDER BY application_index.applied_at ASC, application_index.id ASC
        ) AS retained_application_id,
        row_number() OVER (
          PARTITION BY application_index.candidate_account_id,
            application_index.tenant_id,
            application_index.job_posting_id
          ORDER BY application_index.applied_at ASC, application_index.id ASC
        ) AS application_rank
      FROM public."candidate_applications_index" AS application_index
    ) AS ranked
    WHERE ranked.application_rank > 1
    ORDER BY ranked.applied_at ASC, ranked.id ASC
  LOOP
    tenant_schema := 'tenant_' || duplicate_row.tenant_id;

    IF duplicate_row.application_id <> duplicate_row.retained_application_id
       AND EXISTS (
         SELECT 1
         FROM pg_namespace
         WHERE nspname = tenant_schema
       ) THEN
      EXECUTE format(
        'DELETE FROM %I."interview_feedbacks" WHERE "interview_id" IN (SELECT "id" FROM %I."interviews" WHERE "application_id" = $1)',
        tenant_schema,
        tenant_schema
      ) USING duplicate_row.application_id;
      EXECUTE format(
        'DELETE FROM %I."interviews" WHERE "application_id" = $1',
        tenant_schema
      ) USING duplicate_row.application_id;
      EXECUTE format(
        'DELETE FROM %I."notes" WHERE "application_id" = $1',
        tenant_schema
      ) USING duplicate_row.application_id;
      EXECUTE format(
        'DELETE FROM %I."applications" WHERE "id" = $1',
        tenant_schema
      ) USING duplicate_row.application_id;
    END IF;

    DELETE FROM public."candidate_applications_index"
    WHERE "id" = duplicate_row.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_candidate_application"
  ON public."candidate_applications_index"
  ("candidate_account_id", "tenant_id", "job_posting_id");
