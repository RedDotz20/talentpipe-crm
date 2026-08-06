import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrgUsersService } from './org-users.service';
import { InviteUserDto, InviteUserSchema } from './dto/invite-user.dto';
import { UpdateRoleDto, UpdateRoleSchema } from './dto/update-role.dto';

const PICKER_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];

@Controller('org/users')
export class OrgUsersController {
  constructor(private readonly orgUsersService: OrgUsersService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...PICKER_ROLES)
  list() {
    return this.orgUsersService.list();
  }

  @Post('invite')
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  invite(@Body(new ZodValidationPipe(InviteUserSchema)) dto: InviteUserDto) {
    return this.orgUsersService.invite(dto);
  }

  @Patch(':userId/role')
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  updateRole(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleDto,
  ) {
    return this.orgUsersService.updateRole(userId, dto);
  }

  @Delete(':userId')
  @UseGuards(AuthGuard('jwt'))
  @Roles('OrgAdmin')
  remove(@Param('userId') userId: string) {
    return this.orgUsersService.remove(userId);
  }
}
