import type { Response } from 'express';

// Positive narrowing: TS can't exclude objects from `unknown`/`{}` in a
// false branch, so `no-base-to-string` requires this predicate to prove
// `String()` only ever sees primitives here.
const isPrimitive = (
  v: unknown,
): v is string | number | boolean | bigint | symbol =>
  typeof v !== 'object' && typeof v !== 'function';

export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text =
      value instanceof Date
        ? value.toISOString()
        : isPrimitive(value)
          ? String(value)
          : (JSON.stringify(value) ?? '');
    // ponytail: ' prefix neutralizes Excel formula injection (=+-@\t\r);
    // false-positives on negative numbers, acceptable for export data
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    const needsQuotes =
      guarded.includes(',') ||
      guarded.includes('"') ||
      guarded.includes('\n') ||
      guarded.includes('\r');
    return needsQuotes ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function csvFilename(resource: string): string {
  return `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function sendCsv(res: Response, csv: string, resource: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${csvFilename(resource)}"`,
  );
  res.send(csv);
}
