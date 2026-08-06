-- Tenant Status Migration
-- Adds a status column to public.tenants for platform-level suspend/reactivate.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
