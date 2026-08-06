import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { getCurrentUser } from '../context/tenant-context';

@Injectable()
export class AuditService {
  constructor(private readonly auditLogRepo: AuditLogRepository) {}

  async log(
    action: string,
    resourceId?: string | null,
    metadata?: Record<string, unknown> | null,
    tenantId?: string,
  ) {
    let user: ReturnType<typeof getCurrentUser>;
    try {
      user = getCurrentUser();
    } catch {
      user = { tenantId: 'system', userId: 'system', role: 'system' };
    }

    await this.auditLogRepo.create({
      tenantId: tenantId ?? user.tenantId,
      userId: user.userId,
      action,
      resourceId: resourceId ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }
}
