#!/bin/sh
set -e

# Idempotent guard: if public.tenants exists, migrations already ran.
if psql -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants'" | grep -q 1; then
  echo "Migrations already applied — skipping."
  exit 0
fi

echo "Applying migrations to ${PGDATABASE}..."
for dir in /migrations/*/; do
  sql="${dir}migration.sql"
  [ -f "$sql" ] || continue
  echo "Applying $(basename "$dir")..."
  psql -v ON_ERROR_STOP=1 -q -f "$sql"
done

echo "Applying template schema..."
psql -v ON_ERROR_STOP=1 -q -f /migrations/template-schema.sql

echo "Migrations complete."
