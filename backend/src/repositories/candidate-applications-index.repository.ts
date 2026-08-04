import { Injectable } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';
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

  async findByJob(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          and(
            eq(
              candidateApplicationsIndex.candidateAccountId,
              candidateAccountId,
            ),
            eq(candidateApplicationsIndex.tenantId, tenantId),
            eq(candidateApplicationsIndex.jobPostingId, jobPostingId),
          ),
        )
        .limit(1)
        .execute();
      return rows[0] ?? null;
    });
  }

  async findByCandidateAndApplication(
    candidateAccountId: string,
    applicationId: string,
  ) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          and(
            eq(
              candidateApplicationsIndex.candidateAccountId,
              candidateAccountId,
            ),
            eq(candidateApplicationsIndex.applicationId, applicationId),
          ),
        )
        .limit(1)
        .execute();
      return rows[0] ?? null;
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

  async updateStatus(applicationId: string, tenantId: string, status: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(candidateApplicationsIndex)
        .set({ status })
        .where(
          and(
            eq(candidateApplicationsIndex.applicationId, applicationId),
            eq(candidateApplicationsIndex.tenantId, tenantId),
          ),
        )
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
