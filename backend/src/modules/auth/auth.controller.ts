import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/context/tenant-context';
import { OrgSignupSchema, OrgSignupDto } from './dto/org-signup.dto';
import { SigninSchema, SigninDto } from './dto/signin.dto';
import { RefreshSchema, RefreshDto } from './dto/refresh.dto';
import {
  CandidateSignupSchema,
  CandidateSignupDto,
} from './dto/candidate-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('org/signup')
  async orgSignup(
    @Body(new ZodValidationPipe(OrgSignupSchema)) dto: OrgSignupDto,
  ) {
    return this.authService.orgSignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(@Body(new ZodValidationPipe(SigninSchema)) dto: SigninDto) {
    return this.authService.signin(dto);
  }

  @Post('signup')
  async signup(
    @Body(new ZodValidationPipe(CandidateSignupSchema)) dto: CandidateSignupDto,
  ) {
    return this.authService.candidateSignup(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: TenantContext) {
    await this.authService.logout(user.userId);
    return { message: 'Logged out' };
  }
}
