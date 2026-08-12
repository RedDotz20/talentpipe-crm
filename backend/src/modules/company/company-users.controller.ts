import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { csvFilename } from '../../common/csv.helper';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyUsersService } from './company-users.service';
import { CreateUserDto, CreateUserSchema } from './dto/invite-user.dto';
import {
  ResetPasswordDto,
  ResetPasswordSchema,
} from './dto/reset-password.dto';
import { UpdateRoleDto, UpdateRoleSchema } from './dto/update-role.dto';

const PICKER_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager'];

@Controller('company/users')
export class CompanyUsersController {
  constructor(private readonly orgUsersService: CompanyUsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...PICKER_ROLES)
  list() {
    return this.orgUsersService.list();
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @Roles(...PICKER_ROLES)
  @SkipEnvelope()
  async exportCsv(@Res() res: Response) {
    const csv = await this.orgUsersService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('company-users')}"`,
    );
    res.send(csv);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  create(@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto) {
    return this.orgUsersService.create(dto);
  }

  @Patch(':userId/password')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  resetPassword(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    return this.orgUsersService.resetPassword(userId, dto);
  }

  @Patch(':userId/suspend')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  suspend(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.orgUsersService.setStatus(userId, 'suspended');
  }

  @Patch(':userId/reactivate')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  reactivate(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.orgUsersService.setStatus(userId, 'active');
  }

  @Patch(':userId/role')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  updateRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
  ) {
    return this.orgUsersService.updateRole(userId, dto);
  }

  @Delete(':userId')
  @UseGuards(AuthGuard('jwt'))
  @Roles('CompanyAdmin')
  remove(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.orgUsersService.remove(userId);
  }
}
