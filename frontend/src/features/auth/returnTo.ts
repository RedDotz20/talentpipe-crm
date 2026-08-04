export function getSafeCareerReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/careers/')) {
    return null;
  }

  if (value.includes('\\') || value.startsWith('//')) {
    return null;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return null;
  }

  return value;
}
