-- Rename Tenant/Org → Company Migration
-- Renames: tenants→companies, tenant_id→company_id, tenant_<uuid>→company_<uuid>, OrgAdmin→CompanyAdmin

-- 1. Rename table
ALTER TABLE "public"."tenants" RENAME TO "companies";

-- 2. Rename columns on public-schema tables
ALTER TABLE "public"."user_emails" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."refresh_tokens" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."audit_logs" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."candidate_bookmarks" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."candidate_applications_index" RENAME COLUMN "tenant_id" TO "company_id";
ALTER TABLE "public"."job_listings_index" RENAME COLUMN "tenant_id" TO "company_id";

-- 3. Rename indexes
ALTER INDEX "public"."idx_audit_logs_tenant_action" RENAME TO "idx_audit_logs_company_action";
ALTER INDEX "public"."idx_candidate_bookmarks_tenant_job" RENAME TO "idx_candidate_bookmarks_company_job";
ALTER INDEX "public"."idx_candidate_applications_tenant_job" RENAME TO "idx_candidate_applications_company_job";
ALTER INDEX "public"."idx_job_listings_company" RENAME TO "idx_job_listings_company_name";
ALTER INDEX "public"."idx_job_listings_tenant" RENAME TO "idx_job_listings_company";

-- 4. Rename PostgreSQL schemas (tenant_<uuid> → company_<uuid>)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'
  LOOP
    EXECUTE 'ALTER SCHEMA "' || r.nspname || '" RENAME TO "company_' || substring(r.nspname FROM 8) || '"';
  END LOOP;
END $$;

-- 5. Migrate OrgAdmin → CompanyAdmin role across all company schemas
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'company_%'
  LOOP
    EXECUTE 'UPDATE "' || r.nspname || '"."users" SET "role" = ''CompanyAdmin'' WHERE "role" = ''OrgAdmin''';
    EXECUTE 'ALTER TABLE "' || r.nspname || '"."users" ALTER COLUMN "role" SET DEFAULT ''CompanyAdmin''';
  END LOOP;
END $$;
