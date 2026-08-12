export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text =
      value instanceof Date ? value.toISOString() : String(value);
    // ponytail: ' prefix neutralizes Excel formula injection (=+-@);
    // false-positives on negative numbers, acceptable for export data
    const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
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
