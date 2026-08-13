-- Preset name uniqueness migration
-- Case-insensitive unique index on permission_presets.name, per schema
-- (public: defaults + globals; template + company_%: company customs).

CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_presets_name
  ON public.permission_presets (lower(name));

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
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_permission_presets_name
         ON %I.permission_presets (lower(name))',
      schema_name
    );
  END LOOP;
END $$;
