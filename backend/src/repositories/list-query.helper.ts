import { and, asc, desc, ilike, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { ListQueryDto } from '@/common/dto/list-query.dto';

export interface ListQuerySortOptions {
  sortMap: Record<string, PgColumn>;
  defaultSortBy: string;
  defaultSortDir?: 'asc' | 'desc';
}

export const toWhere = (
  query: ListQueryDto,
  searchColumns: PgColumn[],
): SQL[] => {
  if (!query.search || searchColumns.length === 0) return [];
  const pattern = `%${query.search}%`;
  return [or(...searchColumns.map((column) => ilike(column, pattern))) as SQL];
};

export const toOrderBy = (
  query: ListQueryDto,
  options: ListQuerySortOptions,
) => {
  const column =
    options.sortMap[query.sortBy ?? ''] ??
    options.sortMap[options.defaultSortBy];
  const dir = query.sortDir ?? options.defaultSortDir ?? 'desc';
  return dir === 'asc' ? asc(column) : desc(column);
};

export const toPagination = (query: ListQueryDto) => ({
  offset: (query.page - 1) * query.pageSize,
  limit: query.pageSize,
});

export const listEnvelope = <T>(
  data: T[],
  total: number,
  query: ListQueryDto,
) => ({
  data,
  total,
  page: query.page,
  pageSize: query.pageSize,
});

export const inMemorySearch = <T>(
  rows: T[],
  search: string | undefined,
  fields: readonly (keyof T)[],
): T[] => {
  if (!search) return rows;
  const term = search.toLowerCase();
  return rows.filter((row) =>
    fields.some((field) =>
      String((row as Record<keyof T, unknown>)[field] ?? '')
        .toLowerCase()
        .includes(term),
    ),
  );
};

export const sortAndPageInMemory = <T>(
  rows: T[],
  query: ListQueryDto,
  valueOf: (row: T, sortBy: string) => string | number | Date | null,
  defaultSortBy: string,
  defaultSortDir: 'asc' | 'desc' = 'desc',
): { data: T[]; total: number } => {
  const sortBy = query.sortBy ?? defaultSortBy;
  const dir = (query.sortDir ?? defaultSortDir) === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const av = valueOf(a, sortBy) ?? '';
    const bv = valueOf(b, sortBy) ?? '';
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return 0;
  });
  const total = sorted.length;
  const start = (query.page - 1) * query.pageSize;
  return { data: sorted.slice(start, start + query.pageSize), total };
};

export const andConditions = (...groups: SQL[][]): SQL | undefined => {
  const flattened = groups.flat();
  return flattened.length > 0 ? and(...flattened) : undefined;
};
