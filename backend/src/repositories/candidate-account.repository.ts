import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { candidateAccounts } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateAccountRepository extends BaseRepository {
  async findByEmail(email: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateAccounts)
        .where(eq(candidateAccounts.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }

  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateAccounts)
        .where(eq(candidateAccounts.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateAccounts)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
