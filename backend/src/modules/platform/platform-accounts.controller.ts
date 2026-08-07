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
  CreateTenantUserSchema,
  CreateTenantUserDto,
} from './dto/create-tenant-user.dto';
import {
  UpdateTenantUserSchema,
  UpdateTenantUserDto,
} from './dto/update-tenant-user.dto';
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

  @Get('tenants/:id/users')
  listTenantUsers(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.listTenantUsers(id);
  }

  @Post('tenants/:id/users')
  createTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CreateTenantUserSchema))
    body: CreateTenantUserDto,
  ) {
    return this.accountsService.createTenantUser(id, body);
  }

  @Patch('tenants/:id/users/:userId')
  updateTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(UpdateTenantUserSchema))
    body: UpdateTenantUserDto,
  ) {
    return this.accountsService.updateTenantUser(id, userId, body);
  }

  @Patch('tenants/:id/users/:userId/suspend')
  suspendTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.setTenantUserStatus(id, userId, 'suspended');
  }

  @Patch('tenants/:id/users/:userId/reactivate')
  reactivateTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.setTenantUserStatus(id, userId, 'active');
  }

  @Delete('tenants/:id/users/:userId')
  removeTenantUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accountsService.removeTenantUser(id, userId);
  }

  @Get('tenants/:id/pipeline-stages')
  listTenantStages(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountsService.listTenantStages(id);
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
