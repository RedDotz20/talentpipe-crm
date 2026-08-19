import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { NotificationWorkerService } from '@/workers/notification.worker.service';
import { AuditLogRepository } from '@/repositories/audit-log.repository';
import {
  BULLMQ_CONNECTION,
  NOTIFICATION_QUEUE,
  STAGE_CHANGE_JOB,
  StageChangeNotificationPayload,
} from '@/queues/queues';

describe('NotificationWorkerService', () => {
  let service: NotificationWorkerService;
  const auditLogRepo = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationWorkerService,
        { provide: BULLMQ_CONNECTION, useValue: { quit: jest.fn() } },
        { provide: NOTIFICATION_QUEUE, useValue: { close: jest.fn() } },
        { provide: AuditLogRepository, useValue: auditLogRepo },
      ],
    }).compile();
    service = module.get(NotificationWorkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delivers a stage-change notification to the audit log', async () => {
    const data: StageChangeNotificationPayload = {
      companyId: 'tenant-a',
      actorUserId: 'u1',
      applicationId: 'a1',
      jobPostingId: 'j1',
      fromStage: 's1',
      toStage: 'Interview',
      recipientEmail: 'jane@example.com',
    };
    const job = {
      name: STAGE_CHANGE_JOB,
      data,
    } as Job<StageChangeNotificationPayload>;

    await service.process(job);

    expect(auditLogRepo.create).toHaveBeenCalledWith({
      companyId: 'tenant-a',
      userId: 'u1',
      action: 'notification.stage_change',
      resourceId: 'a1',
      metadata: JSON.stringify({
        jobPostingId: 'j1',
        fromStage: 's1',
        toStage: 'Interview',
        recipientEmail: 'jane@example.com',
      }),
    });
  });

  it('ignores unknown job names', async () => {
    const job = {
      name: 'other',
      data: {},
    } as Job<StageChangeNotificationPayload>;

    await service.process(job);

    expect(auditLogRepo.create).not.toHaveBeenCalled();
  });
});
