import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleSchemaService } from '../database/drizzle-schema.service';
import { candidateAccounts } from '../database/schema';

@Injectable()
export class CandidateAccountRepository {
  constructor(private drizzleSchema: DrizzleSchemaService) {}

  async findByEmail(email: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .select()
        .from(candidateAccounts)
        .where(eq(candidateAccounts.email, email))
        .execute();
      return rows[0] ?? null;
    } finally {
      release();
    }
  }

  async findById(id: string) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .select()
        .from(candidateAccounts)
        .where(eq(candidateAccounts.id, id))
        .execute();
      return rows[0] ?? null;
    } finally {
      release();
    }
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    const { db, release } = await this.drizzleSchema.forPublic();
    try {
      const rows = await db
        .insert(candidateAccounts)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    } finally {
      release();
    }
  }
}
