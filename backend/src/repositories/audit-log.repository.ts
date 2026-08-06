import { Injectable } from '@nestjs/common';
import { auditLogs } from '../database/schema';
import { BaseRepository } from './base.repository';

@Injectable()
export class AuditLogRepository extends BaseRepository {
  async create(data: {
    tenantId: string;
    userId: string;
    action: string;
    resourceId?: string | null;
    metadata?: string | null;
  }) {
    return this.withDb('public', async (db) => {
      const rows = await db
        .insert(auditLogs)
        .values(data)
        .returning()
        .execute();
      return rows[0];
    });
  }
}
