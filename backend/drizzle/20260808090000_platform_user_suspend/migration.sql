-- Per-user suspension for platform management
-- Adds a status column to the master users table (public), the signup template,
-- and all already-provisioned tenant schemas (same shape as scheduled_at_timezone).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

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
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT %L',
      schema_name, 'active'
    );
  END LOOP;
END $$;
