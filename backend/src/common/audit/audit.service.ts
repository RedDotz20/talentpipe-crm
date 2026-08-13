import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { getCurrentUser } from '../context/company-context';

@Injectable()
export class AuditService {
  constructor(private readonly auditLogRepo: AuditLogRepository) {}

  async log(
    action: string,
    resourceId?: string | null,
    metadata?: Record<string, unknown> | null,
    companyId?: string,
  ) {
    let user: ReturnType<typeof getCurrentUser>;
    try {
      user = getCurrentUser();
    } catch {
      user = { companyId: 'system', userId: 'system', role: 'system' };
    }

    await this.auditLogRepo.create({
      companyId: companyId ?? user.companyId,
      userId: user.userId,
      action,
      resourceId: resourceId ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }
}
