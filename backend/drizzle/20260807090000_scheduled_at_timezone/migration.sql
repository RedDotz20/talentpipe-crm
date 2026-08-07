-- Interviews scheduled_at timezone fix
-- Converts the naive timestamp to TIMESTAMP WITH TIME ZONE for public,
-- template, and all already-provisioned tenant schemas.

ALTER TABLE public.interviews
  ALTER COLUMN scheduled_at TYPE TIMESTAMP WITH TIME ZONE;

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
      'ALTER TABLE %I.interviews ALTER COLUMN scheduled_at TYPE TIMESTAMP WITH TIME ZONE',
      schema_name
    );
  END LOOP;
END $$;
