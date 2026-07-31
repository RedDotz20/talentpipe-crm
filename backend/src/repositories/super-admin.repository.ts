import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { superAdmins } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class SuperAdminRepository extends BaseRepository {
  async findByEmail(email: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(superAdmins)
        .where(eq(superAdmins.email, email))
        .execute();
      return rows[0] ?? null;
    });
  }
}
