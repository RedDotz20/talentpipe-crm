import { Module } from '@nestjs/common';
import {
  BULLMQ_CONNECTION,
  NOTIFICATION_QUEUE,
  bullConnectionProvider,
  notificationQueueProvider,
} from './queues';
import { NotificationWorkerService } from '../workers/notification.worker.service';
import { RepositoriesModule } from '../repositories/repositories.module';

@Module({
  imports: [RepositoriesModule],
  providers: [
    bullConnectionProvider,
    notificationQueueProvider,
    NotificationWorkerService,
  ],
  exports: [BULLMQ_CONNECTION, NOTIFICATION_QUEUE],
})
export class QueuesModule {
  constructor(private readonly worker: NotificationWorkerService) {}
}
