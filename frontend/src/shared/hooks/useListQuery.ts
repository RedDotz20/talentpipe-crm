import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import type { ListQueryParams } from '@/shared/types/listQuery';

export interface UseListQueryOptions {
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  pageSize?: number;
}

export function useListQuery(options: UseListQueryOptions = {}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(options.sortBy ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    options.sortDir ?? 'desc',
  );

  const params = useMemo<ListQueryParams>(() => {
    const value: ListQueryParams = {
      page,
      pageSize: options.pageSize ?? 10,
      sortDir,
    };
    const term = debouncedSearch.trim();
    if (term) value.search = term;
    if (sortBy) value.sortBy = sortBy;
    return value;
  }, [debouncedSearch, page, sortBy, sortDir, options.pageSize]);

  const toggleSortDir = () =>
    setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));

  return {
    search,
    setSearch,
    page,
    setPage,
    sortBy,
    setSortBy,
    sortDir,
    toggleSortDir,
    params,
  };
}
