import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword } from '@/common/password';
import { TokenService } from '@/modules/auth/services/token.service';
import { CompanyProvisioningService } from '@/modules/auth/services/company-provisioning.service';
import { CompanySignupDto } from '@/modules/auth/dto/company-signup.dto';
import { SigninDto } from '@/modules/auth/dto/signin.dto';
import { RefreshDto } from '@/modules/auth/dto/refresh.dto';
import { CandidateSignupDto } from '@/modules/auth/dto/candidate-auth.dto';
import { UserEmailRepository } from '@/repositories/user-email.repository';
import { UserRepository } from '@/repositories/user.repository';
import { CandidateAccountRepository } from '@/repositories/candidate-account.repository';
import { SuperAdminRepository } from '@/repositories/super-admin.repository';
import { CompanyRepository } from '@/repositories/company.repository';
import { CompanyContext } from '@/common/context/company-context';

@Injectable()
export class AuthService {
  constructor(
    private tenantProvisioning: CompanyProvisioningService,
    private tokenService: TokenService,
    private userEmailRepo: UserEmailRepository,
    private userRepo: UserRepository,
    private candidateAccountRepo: CandidateAccountRepository,
    private superAdminRepo: SuperAdminRepository,
    private tenantRepo: CompanyRepository,
  ) {}

  async companySignup(dto: CompanySignupDto) {
    const { companyId, userId } =
      await this.tenantProvisioning.createTenant(dto);
    const tokens = await this.tokenService.issueTokens({
      id: userId,
      companyId,
      role: 'CompanyAdmin',
    });
    return { data: tokens, message: 'Company created' };
  }

  async signin(dto: SigninDto) {
    const emailRecord = await this.userEmailRepo.findByEmail(dto.email);
    if (emailRecord) {
      const user = await this.userRepo.findByEmail(
        dto.email,
        `company_${emailRecord.companyId}`,
      );
      if (!user) throw new UnauthorizedException('Invalid credentials');
      const valid = await verifyPassword(user.passwordHash, dto.password);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      const tenant = await this.tenantRepo.findById(emailRecord.companyId);
      if (tenant?.status === 'suspended') {
        throw new ForbiddenException('This company account is suspended');
      }

      if (user.status === 'suspended') {
        throw new ForbiddenException('This account is suspended');
      }

      const tokens = await this.tokenService.issueTokens({
        id: user.id,
        companyId: emailRecord.companyId,
        role: user.role,
      });
      return { data: tokens, message: 'Signed in' };
    }

    const account = await this.candidateAccountRepo.findByEmail(dto.email);
    if (account) {
      const valid = await verifyPassword(account.passwordHash, dto.password);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      const tokens = await this.tokenService.issueTokens({
        id: account.id,
        companyId: null,
        role: 'Candidate',
      });
      return { data: tokens, message: 'Signed in' };
    }

    const admin = await this.superAdminRepo.findByEmail(dto.email);
    if (!admin) throw new UnauthorizedException('Invalid credentials');
    const valid = await verifyPassword(admin.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.tokenService.issueTokens({
      id: admin.id,
      companyId: null,
      role: 'SuperAdmin',
    });
    return { data: tokens, message: 'Signed in' };
  }

  async candidateSignup(dto: CandidateSignupDto) {
    const existing = await this.candidateAccountRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already taken');
    const companyOwner = await this.userEmailRepo.findByEmail(dto.email);
    if (companyOwner) throw new ConflictException('Email already taken');

    const passwordHash = await hashPassword(dto.password);
    const account = await this.candidateAccountRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    const tokens = await this.tokenService.issueTokens({
      id: account.id,
      companyId: null,
      role: 'Candidate',
    });
    return { data: tokens, message: 'Account created' };
  }

  async logout(userId: string) {
    await this.tokenService.logout(userId);
  }

  async refresh(dto: RefreshDto) {
    return {
      data: await this.tokenService.rotate(dto.refreshToken),
      message: 'Signed in',
    };
  }

  async me(ctx: CompanyContext) {
    if (ctx.role === 'Candidate') {
      const account = await this.candidateAccountRepo.findById(ctx.userId);
      if (!account) throw new UnauthorizedException('Account not found');
      return {
        id: account.id,
        role: 'Candidate',
        companyId: null,
        email: account.email,
        name: `${account.firstName} ${account.lastName}`.trim(),
        avatarUrl: account.avatarUrl ?? null,
      };
    }

    if (ctx.role === 'SuperAdmin') {
      const admin = await this.superAdminRepo.findById(ctx.userId);
      if (!admin) throw new UnauthorizedException('Account not found');
      return {
        id: admin.id,
        role: 'SuperAdmin',
        companyId: null,
        email: admin.email,
        name: admin.name ?? null,
        avatarUrl: admin.avatarUrl ?? null,
      };
    }

    const user = await this.userRepo.findById(ctx.userId);
    if (!user) throw new UnauthorizedException('Account not found');
    return {
      id: user.id,
      role: user.role,
      companyId: ctx.companyId,
      email: user.email,
      name: user.name ?? null,
      avatarUrl: user.avatarUrl ?? null,
    };
  }
}
