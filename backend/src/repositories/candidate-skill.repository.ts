import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { candidateSkills } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class CandidateSkillRepository extends BaseRepository {
  async findByCandidateAccountId(accountId: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select({ skillId: candidateSkills.skillId })
        .from(candidateSkills)
        .where(eq(candidateSkills.candidateAccountId, accountId))
        .execute();
      return rows.map((row) => row.skillId);
    });
  }

  async replaceAll(accountId: string, skillIds: string[]) {
    return this.withDb('public', async (db) => {
      await db
        .delete(candidateSkills)
        .where(eq(candidateSkills.candidateAccountId, accountId))
        .execute();
      if (skillIds.length > 0) {
        await db
          .insert(candidateSkills)
          .values(
            skillIds.map((skillId) => ({ candidateAccountId: accountId, skillId })),
          )
          .execute();
      }
    });
  }

  async delete(accountId: string, skillId: string) {
    return this.withDb('public', (db) =>
      db
        .delete(candidateSkills)
        .where(
          and(
            eq(candidateSkills.candidateAccountId, accountId),
            eq(candidateSkills.skillId, skillId),
          ),
        )
        .execute(),
    );
  }
}
