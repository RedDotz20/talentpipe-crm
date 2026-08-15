import { Injectable } from '@nestjs/common';
import { eq, desc, count } from 'drizzle-orm';
import { candidates, candidateAccounts } from '../database/schema';
import { BaseRepository } from './base.repository';
import {
  andConditions,
  listEnvelope,
  toOrderBy,
  toPagination,
  toWhere,
} from './list-query.helper';
import type { ListQueryDto } from '../common/dto/list-query.dto';

const CANDIDATE_SELECT = {
  id: candidates.id,
  name: candidates.name,
  email: candidates.email,
  phone: candidates.phone,
  candidateAccountId: candidates.candidateAccountId,
  createdAt: candidates.createdAt,
  avatarUrl: candidateAccounts.avatarUrl,
};

@Injectable()
export class CandidateRepository extends BaseRepository {
  async findAll() {
    return this.withDb('current', async (db) => {
      return db
        .select()
        .from(candidates)
        .orderBy(desc(candidates.createdAt))
        .execute();
    });
  }

  async findPaginated(query: ListQueryDto, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const conditions = andConditions(
        toWhere(query, [candidates.name, candidates.email]),
      );
      const sortOptions = {
        sortMap: {
          name: candidates.name,
          createdAt: candidates.createdAt,
        },
        defaultSortBy: 'createdAt',
      };
      const { offset, limit } = toPagination(query);
      const [rows, totalRows] = await Promise.all([
        db
          .select(CANDIDATE_SELECT)
          .from(candidates)
          .leftJoin(
            candidateAccounts,
            eq(candidates.candidateAccountId, candidateAccounts.id),
          )
          .where(conditions)
          .orderBy(toOrderBy(query, sortOptions))
          .limit(limit)
          .offset(offset)
          .execute(),
        db
          .select({ value: count() })
          .from(candidates)
          .where(conditions)
          .execute(),
      ]);
      return listEnvelope(rows, Number(totalRows[0]?.value ?? 0), query);
    });
  }

  async findAllFiltered(query: ListQueryDto) {
    return this.withDb('current', async (db) => {
      const conditions = andConditions(
        toWhere(query, [candidates.name, candidates.email]),
      );
      return db
        .select(CANDIDATE_SELECT)
        .from(candidates)
        .leftJoin(
          candidateAccounts,
          eq(candidates.candidateAccountId, candidateAccounts.id),
        )
        .where(conditions)
        .orderBy(desc(candidates.createdAt))
        .execute();
    });
  }

  async findById(id: string) {
    return this.withDb('current', async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, id))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByEmail(email: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByAccountId(accountId: string, schema = 'current') {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .select()
        .from(candidates)
        .where(eq(candidates.candidateAccountId, accountId))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(
    data: { name: string; email?: string | null; phone?: string | null },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(candidates)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async createFromAccount(
    accountId: string,
    data: { name: string; email: string; phone?: string | null },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .insert(candidates)
        .values({ ...data, candidateAccountId: accountId })
        .returning()
        .execute();
      return rows[0];
    });
  }

  async update(
    id: string,
    data: { name?: string; email?: string; phone?: string | null },
    schema = 'current',
  ) {
    return this.withDb(schema, async (db) => {
      const rows = await db
        .update(candidates)
        .set(data)
        .where(eq(candidates.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async delete(id: string, schema = 'current') {
    return this.withDb(schema, (db) =>
      db.delete(candidates).where(eq(candidates.id, id)).execute(),
    );
  }
}
