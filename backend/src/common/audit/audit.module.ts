import { Module } from '@nestjs/common';
import { RepositoriesModule } from '@/repositories/repositories.module';
import { AuditService } from '@/common/audit/audit.service';

@Module({
  imports: [RepositoriesModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
