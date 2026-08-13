import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../database/drizzle-schema.service';

export type TimeUnit = 'day' | 'week' | 'month';
export type TimeSeries = Record<
  TimeUnit,
  Array<{ label: string; count: number }>
>;

// Windows: day = last 30 days, week = last 12 weeks, month = last 12 months.
const UNIT_SPANS: Record<TimeUnit, string> = {
  day: "'29 days'",
  week: "'11 weeks'",
  month: "'11 months'",
};

const UNIT_FORMATS: Record<TimeUnit, string> = {
  day: 'YYYY-MM-DD',
  week: 'YYYY-MM-DD',
  month: 'YYYY-MM',
};

const UNITS: TimeUnit[] = ['day', 'week', 'month'];

/**
 * Counts rows of `table` bucketed by day/week/month over the bounded windows,
 * zero-filling empty buckets via generate_series. `table`/`column` are
 * whitelisted literal unions, never user input.
 */
export async function timeBucketedCounts(
  db: DrizzleDB,
  table: 'applications' | 'companies',
  column: 'applied_at' | 'created_at',
): Promise<TimeSeries> {
  const result: TimeSeries = { day: [], week: [], month: [] };
  for (const unit of UNITS) {
    const { rows } = await db.execute(sql`
      SELECT to_char(d, '${sql.raw(UNIT_FORMATS[unit])}') AS label,
             count(t.id)::int AS count
      FROM generate_series(
        date_trunc('${sql.raw(unit)}', now()) - ${sql.raw(UNIT_SPANS[unit])}::interval,
        date_trunc('${sql.raw(unit)}', now()),
        '1 ${sql.raw(unit)}'::interval
      ) d
      LEFT JOIN ${sql.raw(table)} t
        ON date_trunc('${sql.raw(unit)}', t.${sql.raw(column)}) = d
      GROUP BY d
      ORDER BY d
    `);
    result[unit] = rows.map((row) => ({
      label: String(row.label),
      count: Number(row.count ?? 0),
    }));
  }
  return result;
}
