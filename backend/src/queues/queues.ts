import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const NOTIFICATION_QUEUE = Symbol('NOTIFICATION_QUEUE');
export const BULLMQ_CONNECTION = Symbol('BULLMQ_CONNECTION');
export const NOTIFICATION_QUEUE_NAME = 'notifications';
export const STAGE_CHANGE_JOB = 'stage-change';

export interface StageChangeNotificationPayload {
  tenantId: string;
  actorUserId: string;
  applicationId: string;
  jobPostingId: string | null;
  fromStage: string | null;
  toStage: string;
  recipientEmail: string | null;
}

// ponytail: dedicated connection — BullMQ requires maxRetriesPerRequest null;
// the Phase 6 limiter/cache connection uses 1 and must not be shared.
export const bullConnectionProvider = {
  provide: BULLMQ_CONNECTION,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    }),
};

export const notificationQueueProvider = {
  provide: NOTIFICATION_QUEUE,
  inject: [BULLMQ_CONNECTION],
  useFactory: (connection: Redis) =>
    new Queue(NOTIFICATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    }),
};
