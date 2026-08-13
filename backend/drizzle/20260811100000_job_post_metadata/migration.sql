-- Job post metadata migration
-- Adds employment_type / location / work_setup to public.job_postings (the
-- template source), the public job_listings_index, template, and all
-- already-provisioned company schemas.

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS location VARCHAR(150),
  ADD COLUMN IF NOT EXISTS work_setup VARCHAR(30);

ALTER TABLE public.job_listings_index
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS location VARCHAR(150),
  ADD COLUMN IF NOT EXISTS work_setup VARCHAR(30);

DO $$
DECLARE
  schema_name TEXT;
BEGIN
  FOR schema_name IN
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = 'template' OR nspname LIKE 'company_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.job_postings
       ADD COLUMN IF NOT EXISTS employment_type VARCHAR(30),
       ADD COLUMN IF NOT EXISTS location VARCHAR(150),
       ADD COLUMN IF NOT EXISTS work_setup VARCHAR(30)',
      schema_name
    );
  END LOOP;
END $$;
