import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { refreshTokens } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class RefreshTokenRepository extends BaseRepository {
  async findLatestByUser(userId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .orderBy(desc(refreshTokens.createdAt))
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async deleteByUser(userId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(refreshTokens)
        .where(eq(refreshTokens.userId, userId))
        .execute(),
    );
  }

  async deleteByCompany(companyId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(refreshTokens)
        .where(eq(refreshTokens.companyId, companyId))
        .execute(),
    );
  }

  async create(data: {
    userId: string;
    companyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(refreshTokens)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
