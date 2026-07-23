import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import {
  CandidateSignupDto,
  CandidateLoginDto,
} from './dto/candidate-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body()
    dto: {
      companyName: string;
      slug: string;
      email: string;
      password: string;
    },
  ) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: { email: string; password: string }) {
    return this.authService.login(dto);
  }

  @Post('candidate/signup')
  async candidateSignup(@Body() dto: CandidateSignupDto) {
    return this.authService.candidateSignup(dto);
  }

  @Post('candidate/login')
  @HttpCode(HttpStatus.OK)
  async candidateLogin(@Body() dto: CandidateLoginDto) {
    return this.authService.candidateLogin(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.userId);
    return { message: 'Logged out' };
  }
}
