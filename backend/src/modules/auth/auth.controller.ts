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
import { LoginRateLimiterGuard } from '../../common/middlewares/login-rate-limiter.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyContext } from '../../common/context/company-context';
import {
  CompanySignupSchema,
  CompanySignupDto,
} from './dto/company-signup.dto';
import { SigninSchema, SigninDto } from './dto/signin.dto';
import { RefreshSchema, RefreshDto } from './dto/refresh.dto';
import {
  CandidateSignupSchema,
  CandidateSignupDto,
} from './dto/candidate-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('company/signup')
  async companySignup(
    @Body(new ZodValidationPipe(CompanySignupSchema)) dto: CompanySignupDto,
  ) {
    return this.authService.companySignup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimiterGuard)
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
  async logout(@CurrentUser() user: CompanyContext) {
    await this.authService.logout(user.userId);
    return { data: null, message: 'Logged out' };
  }
}
