-- Permission management migration
-- Creates permission_presets (public: defaults + SuperAdmin globals; company
-- schemas: CompanyAdmin customs) and adds users.preset_id.

CREATE TABLE IF NOT EXISTS public.permission_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  permissions JSONB NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preset_id UUID;

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
      'CREATE TABLE IF NOT EXISTS %I.permission_presets (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         name VARCHAR(100) NOT NULL,
         role VARCHAR(50) NOT NULL,
         permissions JSONB NOT NULL,
         is_default BOOLEAN NOT NULL DEFAULT false,
         created_by UUID,
         created_at TIMESTAMP NOT NULL DEFAULT now())',
      schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS preset_id UUID',
      schema_name
    );
  END LOOP;
END $$;
