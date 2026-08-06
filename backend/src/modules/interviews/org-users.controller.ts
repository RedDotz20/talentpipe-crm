import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRepository } from '../../repositories/user.repository';

const PICKER_ROLES = ['OrgAdmin', 'Recruiter', 'HiringManager'];

@Controller('org/users')
export class OrgUsersController {
  constructor(private readonly userRepo: UserRepository) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @Roles(...PICKER_ROLES)
  list() {
    return this.userRepo.findAll();
  }
}
