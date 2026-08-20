import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { SkipEnvelope } from '@/common/decorators/skip-envelope.decorator';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { sendCsv } from '@/common/csv.helper';
import { ListQuerySchema, ListQueryDto } from '@/common/dto/list-query.dto';
import { PlatformAccountsService } from '@/modules/platform/platform-accounts.service';
import {
  CreateCompanyUserSchema,
  CreateCompanyUserDto,
} from '@/modules/platform/dto/create-company-user.dto';
import {
  UpdateCompanyUserSchema,
  UpdateCompanyUserDto,
} from '@/modules/platform/dto/update-company-user.dto';
import {
  CreateCandidateSchema,
  CreateCandidateDto,
} from '@/modules/platform/dto/create-candidate.dto';
import {
  UpdateCandidateSchema,
  UpdateCandidateDto,
} from '@/modules/platform/dto/update-candidate.dto';
import {
  AssignPresetSchema,
  AssignPresetDto,
} from '@/modules/company/dto/assign-preset.dto';
import { PlatformPermissionsService } from '@/modules/platform/platform-permissions.service';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformAccountsController {
  constructor(
    private readonly accountsService: PlatformAccountsService,
    private readonly permissionsService: PlatformPermissionsService,
  ) {}

  @Get('companies/:id/users')
  listCompanyUsers(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.listCompanyUsers(id);
  }

  @Post('companies/:id/users')
  createCompanyUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateCompanyUserSchema))
    body: CreateCompanyUserDto,
  ) {
    return this.accountsService.createCompanyUser(id, body);
  }

  @Patch('companies/:id/users/:userId')
  updateCompanyUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(UpdateCompanyUserSchema))
    body: UpdateCompanyUserDto,
  ) {
    return this.accountsService.updateCompanyUser(id, userId, body);
  }

  @Patch('companies/:id/users/:userId/preset')
  assignPreset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(AssignPresetSchema)) body: AssignPresetDto,
  ) {
    return this.permissionsService.assign(id, userId, body.presetId);
  }

  @Patch('companies/:id/users/:userId/suspend')
  suspendTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.setCompanyUserStatus(id, userId, 'suspended');
  }

  @Patch('companies/:id/users/:userId/reactivate')
  reactivateTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.setCompanyUserStatus(id, userId, 'active');
  }

  @Delete('companies/:id')
  deleteCompany(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.deleteCompany(id);
  }

  @Delete('companies/:id/users/:userId')
  removeCompanyUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.removeCompanyUser(id, userId);
  }

  @Get('companies/:id/pipeline-stages')
  listCompanyStages(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.listCompanyStages(id);
  }

  @Get('users/export')
  @SkipEnvelope()
  async exportAllUsers(
    @Res() res: Response,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('type') type?: string,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
    @Query('role') role?: string,
  ) {
    const csv = await this.accountsService.exportAllUsers({
      ...query,
      type,
      companyId,
      role,
    });
    sendCsv(res, csv, 'users');
  }

  @Get('users')
  listAllUsers(
    @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQueryDto,
    @Query('type') type?: string,
    @Query('companyId') companyId?: string,
    @Query('role') role?: string,
  ) {
    return this.accountsService.listAllUsers({
      ...query,
      type,
      companyId,
      role,
    });
  }

  @Get('candidates')
  listCandidates() {
    return this.accountsService.listCandidates();
  }

  @Post('candidates')
  createCandidate(
    @Body(new ZodValidationPipe(CreateCandidateSchema))
    body: CreateCandidateDto,
  ) {
    return this.accountsService.createCandidate(body);
  }

  @Patch('candidates/:id')
  updateCandidate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCandidateSchema))
    body: UpdateCandidateDto,
  ) {
    return this.accountsService.updateCandidate(id, body);
  }

  @Delete('candidates/:id')
  removeCandidate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.removeCandidate(id);
  }
}
