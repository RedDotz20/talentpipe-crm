export function toCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text =
      value instanceof Date ? value.toISOString() : String(value);
    const needsQuotes =
      text.includes(',') ||
      text.includes('"') ||
      text.includes('\n') ||
      text.includes('\r');
    return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
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
