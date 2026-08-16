import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { seedDatabase } from './seed-data';

// ponytail: ports scripts/prod-migrate.sh into the boot path — same semantics
// (guard → run drizzle/*/migration.sql in order → template-schema.sql), no psql
// needed. Guard checks the real `companies` table (the shell script's `tenants`
// check is stale). Single instance on Render free → no race on check-then-run.
export async function initDatabase(pool: Pool, logger: Logger): Promise<void> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'companies'`,
  );
  if (rows.length === 0) {
    const dir = join(process.cwd(), 'drizzle');
    if (!existsSync(dir)) {
      logger.warn(
        `No drizzle/ folder found at ${dir} — skipping migrations. ` +
          'Apply them manually (prod-migrate.sh or psql).',
      );
    } else {
      logger.log('Schema missing — applying migrations...');
      const files = [
        ...readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => join(dir, e.name, 'migration.sql')),
        join(dir, 'template-schema.sql'),
      ];
      for (const file of files) {
        if (!existsSync(file)) continue;
        const label =
          basename(file) === 'migration.sql'
            ? basename(dirname(file))
            : basename(file);
        logger.log(`Applying ${label}...`);
        await pool.query(readFileSync(file, 'utf8'));
      }
      logger.log('Migrations complete.');
    }
  } else {
    logger.log('Schema already present — skipping migrations');
  }

  // Opt-in demo data: only when no company exists yet (self-healing — a failed
  // seed rolls back and the count stays 0, so the next boot retries).
  if (process.env.SEED_ON_BOOT === 'true') {
    const { rows: c } = await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.companies',
    );
    if (c[0].n === 0) {
      logger.log('Empty database — seeding demo data (SEED_ON_BOOT)...');
      await seedDatabase(pool);
    } else {
      logger.log('Companies exist — skipping auto-seed');
    }
  }
}
