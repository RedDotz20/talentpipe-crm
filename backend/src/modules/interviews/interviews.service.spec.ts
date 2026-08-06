import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { InterviewRepository } from '../../repositories/interview.repository';
import { InterviewFeedbackRepository } from '../../repositories/interview-feedback.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { UserRepository } from '../../repositories/user.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { ApplicationsService } from '../applications/applications.service';

describe('InterviewsService', () => {
  let service: InterviewsService;
  const interviewRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const feedbackRepo = {
    findByInterviewId: jest.fn(),
    create: jest.fn(),
  };
  const applicationRepo = { findById: jest.fn() };
  const userRepo = { findById: jest.fn() };
  const pipelineStageRepo = { findAll: jest.fn() };
  const applicationsService = { updateStage: jest.fn() };

  const scheduler = { tenantId: 't1', userId: 'oa1', role: 'OrgAdmin' };
  const interviewer = { tenantId: 't1', userId: 'iv1', role: 'Interviewer' };
  const interview = {
    id: 'i1',
    applicationId: 'a1',
    interviewerId: 'iv1',
    scheduledAt: new Date('2026-08-10T14:00:00Z'),
    status: 'scheduled',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewsService,
        { provide: InterviewRepository, useValue: interviewRepo },
        { provide: InterviewFeedbackRepository, useValue: feedbackRepo },
        { provide: ApplicationRepository, useValue: applicationRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
        { provide: ApplicationsService, useValue: applicationsService },
      ],
    }).compile();
    service = module.get<InterviewsService>(InterviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('forces the interviewer role to own interviews only', async () => {
    interviewRepo.findAll.mockResolvedValue([interview]);
    await expect(service.list(interviewer)).resolves.toEqual([interview]);
    expect(interviewRepo.findAll).toHaveBeenCalledWith({
      interviewerId: 'iv1',
    });
  });

  it('lets schedulers see all interviews unless assignedToMe is set', async () => {
    interviewRepo.findAll.mockResolvedValue([]);
    await service.list(scheduler);
    expect(interviewRepo.findAll).toHaveBeenCalledWith();
    await service.list(scheduler, 'true');
    expect(interviewRepo.findAll).toHaveBeenLastCalledWith({
      interviewerId: 'oa1',
    });
  });

  it('getOne throws NotFoundException when missing', async () => {
    interviewRepo.findById.mockResolvedValue(null);
    await expect(service.getOne(scheduler, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getOne forbids an unassigned interviewer', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    await expect(
      service.getOne({ ...interviewer, userId: 'other-iv' }, 'i1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getOne returns the interview to the assigned interviewer', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    await expect(service.getOne(interviewer, 'i1')).resolves.toEqual(interview);
  });

  it('schedule throws NotFoundException when the application is missing', async () => {
    applicationRepo.findById.mockResolvedValue(null);
    await expect(
      service.schedule(scheduler, {
        applicationId: 'a1',
        interviewerId: 'iv1',
        scheduledAt: '2026-08-10T14:00:00Z',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('schedule throws NotFoundException when the interviewer is missing', async () => {
    applicationRepo.findById.mockResolvedValue({ id: 'a1' });
    userRepo.findById.mockResolvedValue(null);
    await expect(
      service.schedule(scheduler, {
        applicationId: 'a1',
        interviewerId: 'iv1',
        scheduledAt: '2026-08-10T14:00:00Z',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('schedule creates the interview and auto-moves the application to the Interview stage', async () => {
    applicationRepo.findById.mockResolvedValue({
      id: 'a1',
      currentStageId: 'stage-screening',
    });
    userRepo.findById.mockResolvedValue({ id: 'iv1', email: 'iv@acme.com' });
    interviewRepo.create.mockResolvedValue(interview);
    pipelineStageRepo.findAll.mockResolvedValue([
      { id: 'stage-applied', name: 'Applied' },
      { id: 'stage-screening', name: 'Screening' },
      { id: 'stage-interview', name: 'Interview' },
    ]);

    await expect(
      service.schedule(scheduler, {
        applicationId: 'a1',
        interviewerId: 'iv1',
        scheduledAt: '2026-08-10T14:00:00Z',
      }),
    ).resolves.toEqual(interview);
    expect(interviewRepo.create).toHaveBeenCalledWith({
      applicationId: 'a1',
      interviewerId: 'iv1',
      scheduledAt: new Date('2026-08-10T14:00:00Z'),
    });
    expect(applicationsService.updateStage).toHaveBeenCalledWith(
      'a1',
      { stageId: 'stage-interview' },
      't1',
    );
  });

  it('schedule skips the auto-move when the application is already in the Interview stage', async () => {
    applicationRepo.findById.mockResolvedValue({
      id: 'a1',
      currentStageId: 'stage-interview',
    });
    userRepo.findById.mockResolvedValue({ id: 'iv1', email: 'iv@acme.com' });
    interviewRepo.create.mockResolvedValue(interview);
    pipelineStageRepo.findAll.mockResolvedValue([
      { id: 'stage-interview', name: 'Interview' },
    ]);

    await service.schedule(scheduler, {
      applicationId: 'a1',
      interviewerId: 'iv1',
      scheduledAt: '2026-08-10T14:00:00Z',
    });
    expect(applicationsService.updateStage).not.toHaveBeenCalled();
  });

  it('schedule skips the auto-move when no Interview stage exists', async () => {
    applicationRepo.findById.mockResolvedValue({
      id: 'a1',
      currentStageId: 'stage-screening',
    });
    userRepo.findById.mockResolvedValue({ id: 'iv1', email: 'iv@acme.com' });
    interviewRepo.create.mockResolvedValue(interview);
    pipelineStageRepo.findAll.mockResolvedValue([
      { id: 'stage-screening', name: 'Screening' },
    ]);

    await service.schedule(scheduler, {
      applicationId: 'a1',
      interviewerId: 'iv1',
      scheduledAt: '2026-08-10T14:00:00Z',
    });
    expect(applicationsService.updateStage).not.toHaveBeenCalled();
  });

  it('update throws NotFoundException when missing', async () => {
    interviewRepo.findById.mockResolvedValue(null);
    await expect(
      service.update('nope', { status: 'cancelled' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('update applies reschedule and status changes', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    interviewRepo.update.mockResolvedValue({
      ...interview,
      scheduledAt: new Date('2026-08-11T10:00:00Z'),
      status: 'cancelled',
    });
    await expect(
      service.update('i1', {
        scheduledAt: '2026-08-11T10:00:00Z',
        status: 'cancelled',
      }),
    ).resolves.toEqual({
      ...interview,
      scheduledAt: new Date('2026-08-11T10:00:00Z'),
      status: 'cancelled',
    });
    expect(interviewRepo.update).toHaveBeenCalledWith('i1', {
      scheduledAt: new Date('2026-08-11T10:00:00Z'),
      status: 'cancelled',
    });
  });

  it('submitFeedback throws NotFoundException when missing', async () => {
    interviewRepo.findById.mockResolvedValue(null);
    await expect(
      service.submitFeedback(interviewer, 'nope', { rating: 4 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('submitFeedback forbids a non-assigned interviewer', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    await expect(
      service.submitFeedback({ ...interviewer, userId: 'other-iv' }, 'i1', {
        rating: 4,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('submitFeedback forbids non-interviewer roles even when assigned', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    await expect(
      service.submitFeedback(
        { tenantId: 't1', userId: 'iv1', role: 'OrgAdmin' },
        'i1',
        { rating: 4 },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('submitFeedback rejects duplicate submissions', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    feedbackRepo.findByInterviewId.mockResolvedValue({ id: 'f1' });
    await expect(
      service.submitFeedback(interviewer, 'i1', { rating: 4 }),
    ).rejects.toThrow(ConflictException);
  });

  it('submitFeedback creates feedback and marks the interview completed', async () => {
    interviewRepo.findById.mockResolvedValue(interview);
    feedbackRepo.findByInterviewId.mockResolvedValue(null);
    feedbackRepo.create.mockResolvedValue({
      id: 'f1',
      interviewId: 'i1',
      rating: 4,
      comments: 'Strong',
    });
    await expect(
      service.submitFeedback(interviewer, 'i1', {
        rating: 4,
        comments: 'Strong',
      }),
    ).resolves.toEqual({
      id: 'f1',
      interviewId: 'i1',
      rating: 4,
      comments: 'Strong',
    });
    expect(interviewRepo.update).toHaveBeenCalledWith('i1', {
      status: 'completed',
    });
  });
});
