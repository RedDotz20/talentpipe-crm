import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { superAdmins } from '@/database/schema';
import { BaseRepository } from '@/repositories/base.repository';

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

  async findById(id: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .select()
        .from(superAdmins)
        .where(eq(superAdmins.id, id))
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateName(id: string, name: string) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(superAdmins)
        .set({ name })
        .where(eq(superAdmins.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }

  async updateAvatarUrl(id: string, avatarUrl: string | null) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .update(superAdmins)
        .set({ avatarUrl })
        .where(eq(superAdmins.id, id))
        .returning()
        .execute();
      return rows[0] ?? null;
    });
  }
}
