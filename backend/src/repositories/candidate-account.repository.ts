import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
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

  async findAll() {
    return this.withDb('public', async (db) => {
      return db
        .select({
          id: candidateAccounts.id,
          email: candidateAccounts.email,
          firstName: candidateAccounts.firstName,
          lastName: candidateAccounts.lastName,
          phone: candidateAccounts.phone,
          resumeFileUrl: candidateAccounts.resumeFileUrl,
          avatarUrl: candidateAccounts.avatarUrl,
          createdAt: candidateAccounts.createdAt,
        })
        .from(candidateAccounts)
        .orderBy(desc(candidateAccounts.createdAt))
        .execute();
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

  async updateProfile(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      passwordHash?: string;
    },
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateAccounts)
        .set(data)
        .where(eq(candidateAccounts.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async remove(id: string) {
    return this.withDb('public', (db) =>
      db
        .delete(candidateAccounts)
        .where(eq(candidateAccounts.id, id))
        .execute(),
    );
  }

  async uploadResume(id: string, fileUrl: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateAccounts)
        .set({ resumeFileUrl: fileUrl, resumeUploadedAt: new Date() })
        .where(eq(candidateAccounts.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async removeResume(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateAccounts)
        .set({ resumeFileUrl: null, resumeUploadedAt: null })
        .where(eq(candidateAccounts.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateAvatarUrl(id: string, avatarUrl: string | null) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateAccounts)
        .set({ avatarUrl })
        .where(eq(candidateAccounts.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
