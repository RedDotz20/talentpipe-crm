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

-- Seed the 4 role-default presets (idempotent — one per role). These are the
-- fixed, read-only defaults both permissions pages depend on; custom presets
-- are clones of these.

INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Company Admin Default', 'CompanyAdmin',
  '["jobs.view","jobs.create_edit","jobs.publish_close","jobs.delete","candidates.view","candidates.manage","applications.view","applications.move","applications.note","interviews.view","interviews.schedule","stages.manage","settings.manage","users.manage","permissions.manage","dashboard.view"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_presets WHERE role = 'CompanyAdmin' AND is_default = true);

INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Recruiter Default', 'Recruiter',
  '["jobs.view","jobs.create_edit","jobs.publish_close","candidates.view","candidates.manage","applications.view","applications.move","applications.note","interviews.view","interviews.schedule","dashboard.view"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_presets WHERE role = 'Recruiter' AND is_default = true);

INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
SELECT '00000000-0000-0000-0000-000000000103'::uuid, 'Hiring Manager Default', 'HiringManager',
  '["jobs.view","candidates.view","applications.view","applications.move","applications.note","interviews.view","interviews.schedule","dashboard.view"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_presets WHERE role = 'HiringManager' AND is_default = true);

INSERT INTO public.permission_presets (id, name, role, permissions, is_default)
SELECT '00000000-0000-0000-0000-000000000104'::uuid, 'Interviewer Default', 'Interviewer',
  '["interviews.view","interviews.feedback","dashboard.view"]'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_presets WHERE role = 'Interviewer' AND is_default = true);
