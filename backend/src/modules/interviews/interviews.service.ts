import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InterviewRepository } from '../../repositories/interview.repository';
import { InterviewFeedbackRepository } from '../../repositories/interview-feedback.repository';
import { ApplicationRepository } from '../../repositories/application.repository';
import { UserRepository } from '../../repositories/user.repository';
import { PipelineStageRepository } from '../../repositories/pipeline-stage.repository';
import { CompanyContext } from '../../common/context/company-context';
import type { ListQueryDto } from '../../common/dto/list-query.dto';
import { ApplicationsService } from '../applications/applications.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { UpdateInterviewDto } from './dto/update-interview.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly interviewRepo: InterviewRepository,
    private readonly interviewFeedbackRepo: InterviewFeedbackRepository,
    private readonly applicationRepo: ApplicationRepository,
    private readonly userRepo: UserRepository,
    private readonly pipelineStageRepo: PipelineStageRepository,
    private readonly applicationsService: ApplicationsService,
  ) {}

  list(
    user: CompanyContext,
    query: ListQueryDto & { status?: string; assignedToMe?: string },
  ) {
    const ownOnly =
      user.role === 'Interviewer' || query.assignedToMe === 'true';
    const filters = {
      ...(ownOnly ? { interviewerId: user.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    return this.interviewRepo.findPaginated(filters, query);
  }

  async getOne(user: CompanyContext, id: string) {
    const interview = await this.interviewRepo.findById(id);
    if (!interview) throw new NotFoundException('Interview not found');
    if (
      user.role === 'Interviewer' &&
      interview.interviewerId !== user.userId
    ) {
      throw new ForbiddenException('You are not assigned to this interview');
    }
    return interview;
  }

  async schedule(user: CompanyContext, dto: CreateInterviewDto) {
    const application = await this.applicationRepo.findById(dto.applicationId);
    if (!application) throw new NotFoundException('Application not found');
    const interviewer = await this.userRepo.findById(dto.interviewerId);
    if (!interviewer) throw new NotFoundException('Interviewer not found');
    if (interviewer.role !== 'Interviewer') {
      throw new BadRequestException(
        'Interviews can only be scheduled for users with the Interviewer role',
      );
    }
    const interview = await this.interviewRepo.create({
      applicationId: dto.applicationId,
      interviewerId: dto.interviewerId,
      scheduledAt: new Date(dto.scheduledAt),
    });
    await this.moveToInterviewStage(
      application.id,
      application.currentStageId,
      user.companyId,
    );
    return interview;
  }

  async update(id: string, dto: UpdateInterviewDto) {
    const interview = await this.interviewRepo.findById(id);
    if (!interview) throw new NotFoundException('Interview not found');
    const updated = await this.interviewRepo.update(id, {
      ...(dto.scheduledAt !== undefined
        ? { scheduledAt: new Date(dto.scheduledAt) }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    return updated ?? interview;
  }

  async submitFeedback(
    user: CompanyContext,
    id: string,
    dto: SubmitFeedbackDto,
  ) {
    const interview = await this.interviewRepo.findById(id);
    if (!interview) throw new NotFoundException('Interview not found');
    if (
      user.role !== 'Interviewer' ||
      interview.interviewerId !== user.userId
    ) {
      throw new ForbiddenException(
        'Only the assigned interviewer can submit feedback',
      );
    }
    const existing = await this.interviewFeedbackRepo.findByInterviewId(id);
    if (existing) throw new ConflictException('Feedback already submitted');
    const feedback = await this.interviewFeedbackRepo.create({
      interviewId: id,
      rating: dto.rating,
      comments: dto.comments ?? null,
    });
    await this.interviewRepo.update(id, { status: 'completed' });
    return feedback;
  }

  private async moveToInterviewStage(
    applicationId: string,
    currentStageId: string | null,
    companyId: string,
  ) {
    const stages = await this.pipelineStageRepo.findAll();
    const interviewStage = stages.find((stage) => stage.name === 'Interview');
    if (!interviewStage) {
      this.logger.warn(
        'No stage named "Interview" exists; application was not auto-moved',
      );
      return;
    }
    if (currentStageId === interviewStage.id) return;
    await this.applicationsService.updateStage(
      applicationId,
      { stageId: interviewStage.id },
      companyId,
    );
  }
}
