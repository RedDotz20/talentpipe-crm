import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { userEmails } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class UserEmailRepository extends BaseRepository {
  async findByEmail(email: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(userEmails)
        .where(eq(userEmails.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: { email: string; tenantId: string; userId: string }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(userEmails)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
