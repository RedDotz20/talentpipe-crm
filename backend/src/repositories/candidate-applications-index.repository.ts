import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateApplicationsIndex } from '../database/schema';

@Injectable()
export class CandidateApplicationsIndexRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByCandidate(candidateAccountId: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db
        .select()
        .from(candidateApplicationsIndex)
        .where(
          eq(candidateApplicationsIndex.candidateAccountId, candidateAccountId),
        )
        .orderBy(desc(candidateApplicationsIndex.appliedAt))
        .execute();
    } finally {
      release();
    }
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
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .insert(candidateApplicationsIndex)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    } finally {
      release();
    }
  }

  async updateStatus(applicationId: string, status: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .update(candidateApplicationsIndex)
        .set({ status })
        .where(eq(candidateApplicationsIndex.applicationId, applicationId))
        .returning()
        .execute();
      return rows[0] ?? null;
    } finally {
      release();
    }
  }
}
