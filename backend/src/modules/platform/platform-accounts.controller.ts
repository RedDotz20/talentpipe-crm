import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAccountsService } from './platform-accounts.service';
import {
  CreateCompanyUserSchema,
  CreateCompanyUserDto,
} from './dto/create-company-user.dto';
import {
  UpdateCompanyUserSchema,
  UpdateCompanyUserDto,
} from './dto/update-company-user.dto';
import {
  CreateCandidateSchema,
  CreateCandidateDto,
} from './dto/create-candidate.dto';
import {
  UpdateCandidateSchema,
  UpdateCandidateDto,
} from './dto/update-candidate.dto';

@Controller('platform')
@UseGuards(AuthGuard('jwt'))
@Roles('SuperAdmin')
export class PlatformAccountsController {
  constructor(private readonly accountsService: PlatformAccountsService) {}

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

  @Get('users')
  listAllUsers() {
    return this.accountsService.listAllUsers();
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
