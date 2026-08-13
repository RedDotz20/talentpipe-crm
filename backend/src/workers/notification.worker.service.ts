import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import {
  BULLMQ_CONNECTION,
  NOTIFICATION_QUEUE,
  NOTIFICATION_QUEUE_NAME,
  STAGE_CHANGE_JOB,
  StageChangeNotificationPayload,
} from '../queues/queues';
import { AuditLogRepository } from '../repositories/audit-log.repository';

@Injectable()
export class NotificationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationWorkerService.name);
  private worker: Worker | null = null;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: Redis,
    @Inject(NOTIFICATION_QUEUE) private readonly queue: Queue,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<StageChangeNotificationPayload>(
      NOTIFICATION_QUEUE_NAME,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 1 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.worker?.close();
      await this.queue.close();
      await this.connection.quit();
    } catch (error) {
      this.logger.error(
        'Failed to shut down the notification queue cleanly',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async process(job: Job<StageChangeNotificationPayload>): Promise<void> {
    if (job.name !== STAGE_CHANGE_JOB) return;
    await this.deliver(job.data);
  }

  // ponytail: delivery = audit row + log; real email sending swaps in here
  // when a mailer exists (FR-26 "email, queued" is out of scope for now).
  private async deliver(
    payload: StageChangeNotificationPayload,
  ): Promise<void> {
    await this.auditLogRepo.create({
      companyId: payload.companyId,
      userId: payload.actorUserId,
      action: 'notification.stage_change',
      resourceId: payload.applicationId,
      metadata: JSON.stringify({
        jobPostingId: payload.jobPostingId,
        fromStage: payload.fromStage,
        toStage: payload.toStage,
        recipientEmail: payload.recipientEmail,
      }),
    });
    this.logger.log(
      `Stage-change notification delivered for application ${payload.applicationId} → ${payload.toStage}`,
    );
  }
}
