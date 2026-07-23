import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateBookmarks } from '../database/schema';

@Injectable()
export class CandidateBookmarkRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByCandidate(candidateAccountId: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db
        .select()
        .from(candidateBookmarks)
        .where(eq(candidateBookmarks.candidateAccountId, candidateAccountId))
        .execute();
    } finally {
      release();
    }
  }

  async findByJob(
    candidateAccountId: string,
    tenantId: string,
    jobPostingId: string,
  ) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .select()
        .from(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
            eq(candidateBookmarks.tenantId, tenantId),
            eq(candidateBookmarks.jobPostingId, jobPostingId),
          ),
        )
        .execute();
      return rows[0] ?? null;
    } finally {
      release();
    }
  }

  async create(data: {
    candidateAccountId: string;
    tenantId: string;
    jobPostingId: string;
    jobTitle: string;
    companyName: string;
  }) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .insert(candidateBookmarks)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    } finally {
      release();
    }
  }

  async delete(id: string, candidateAccountId: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      return db
        .delete(candidateBookmarks)
        .where(
          and(
            eq(candidateBookmarks.id, id),
            eq(candidateBookmarks.candidateAccountId, candidateAccountId),
          ),
        )
        .execute();
    } finally {
      release();
    }
  }
}
