-- Preset enable/disable migration
-- Adds is_enabled to permission_presets (public, template, company_%).
-- Existing rows default to enabled.

ALTER TABLE public.permission_presets
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;

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
      'ALTER TABLE %I.permission_presets ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true',
      schema_name
    );
  END LOOP;
END $$;
