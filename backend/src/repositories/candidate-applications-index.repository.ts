import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { candidateApplicationsIndex } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateApplicationsIndexRepository extends BaseRepository {
  async findByCandidate(candidateAccountId: string) {
    return this.withDb('public', async (db) => {
      return db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
        )
        .orderBy(desc(candidateApplicationsIndex.appliedAt))
        .execute();
    });
  }

  async create(data: {
    candidateAccountId: string;
    tenantId: string;
    jobPostingId: string;
    applicationId: string;
    jobTitle: string;
    companyName: string;
    status: string;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(candidateApplicationsIndex)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }

  async updateStatus(applicationId: string, status: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateApplicationsIndex)
        .set({ status })
        .where(eq(candidateApplicationsIndex.applicationId, applicationId))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
