import {
  andConditions,
  inMemorySearch,
  listEnvelope,
  sortAndPageInMemory,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import { eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { jobListingsIndex } from '../database/schema';

const dialect = new PgDialect();
const renderSql = (value: unknown) => dialect.sqlToQuery(value as never).sql;

const baseQuery = {
  search: undefined,
  page: 1,
  pageSize: 10,
  sortBy: undefined,
  sortDir: undefined as 'asc' | 'desc' | undefined,
};

describe('list-query.helper', () => {
  describe('toPagination', () => {
    it('computes offset/limit from page and pageSize', () => {
      expect(toPagination({ ...baseQuery, page: 3, pageSize: 25 })).toEqual({
        offset: 50,
        limit: 25,
      });
    });
  });

  describe('toWhere', () => {
    it('returns an empty array when no search', () => {
      expect(toWhere(baseQuery, [jobListingsIndex.title])).toEqual([]);
    });

    it('builds an ilike OR condition for the searchable columns', () => {
      const conditions = toWhere({ ...baseQuery, search: 'engineer' }, [
        jobListingsIndex.title,
        jobListingsIndex.companyName,
      ]);
      expect(conditions).toHaveLength(1);
      expect(renderSql(conditions[0])).toContain('ilike');
    });
  });

  describe('toOrderBy', () => {
    const options = {
      sortMap: {
        createdAt: jobListingsIndex.createdAt,
        title: jobListingsIndex.title,
      },
      defaultSortBy: 'createdAt',
    };

    it('falls back to the default column for unknown sortBy', () => {
      const sql = toOrderBy({ ...baseQuery, sortBy: 'DROP TABLE x' }, options);
      expect(renderSql(sql)).toContain('"job_listings_index"."created_at"');
    });

    it('honours sortDir asc', () => {
      const sql = toOrderBy(
        { ...baseQuery, sortBy: 'title', sortDir: 'asc' },
        options,
      );
      expect(renderSql(sql)).toContain('asc');
    });
  });

  describe('listEnvelope', () => {
    it('returns data, total, page, pageSize', () => {
      expect(listEnvelope([{ id: 1 }], 42, { ...baseQuery, page: 2 })).toEqual({
        data: [{ id: 1 }],
        total: 42,
        page: 2,
        pageSize: 10,
      });
    });
  });

  describe('inMemorySearch', () => {
    const rows = [
      { name: 'Alice Smith', company: 'Acme' },
      { name: 'Bob Jones', company: 'Globex' },
    ];

    it('returns all rows when no search', () => {
      expect(inMemorySearch(rows, undefined, ['name'])).toHaveLength(2);
    });

    it('filters case-insensitively across the given fields', () => {
      expect(inMemorySearch(rows, 'acme', ['name', 'company'])).toEqual([
        { name: 'Alice Smith', company: 'Acme' },
      ]);
    });
  });

  describe('sortAndPageInMemory', () => {
    const rows = [
      { id: 'a', appliedAt: '2026-01-01' },
      { id: 'b', appliedAt: '2026-02-01' },
      { id: 'c', appliedAt: '2026-03-01' },
    ];
    const valueOf = (row: { appliedAt: string }, sortBy: string) =>
      sortBy === 'appliedAt' ? row.appliedAt : '';

    it('sorts desc by default and pages', () => {
      const result = sortAndPageInMemory(
        rows,
        { ...baseQuery, page: 1, pageSize: 2 },
        valueOf,
        'appliedAt',
      );
      expect(result.total).toBe(3);
      expect(result.data.map((r) => r.id)).toEqual(['c', 'b']);
    });

    it('sorts asc when requested', () => {
      const result = sortAndPageInMemory(
        rows,
        { ...baseQuery, page: 1, pageSize: 10, sortDir: 'asc' },
        valueOf,
        'appliedAt',
      );
      expect(result.data.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('andConditions', () => {
    it('returns undefined when no conditions', () => {
      expect(andConditions([], [])).toBeUndefined();
    });

    it('flattens groups into one AND', () => {
      const result = andConditions(
        [eq(jobListingsIndex.companyId, 'c1')],
        [eq(jobListingsIndex.status, 'open')],
      );
      expect(result).toBeDefined();
    });
  });
});
