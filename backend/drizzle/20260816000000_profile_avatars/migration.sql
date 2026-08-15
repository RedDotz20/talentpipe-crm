-- Profile avatars & user display names
-- users.name/avatar_url must reach public (master), template, and every
-- provisioned company schema; candidate_accounts and super_admins are public-only.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

ALTER TABLE public.candidate_accounts
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);

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
      'ALTER TABLE %I.users ADD COLUMN IF NOT EXISTS name VARCHAR(100),
                             ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)',
      schema_name
    );
  END LOOP;
END $$;
