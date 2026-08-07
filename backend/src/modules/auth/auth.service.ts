import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, verifyPassword } from '../../common/password';
import { TokenService } from './services/token.service';
import { TenantProvisioningService } from './services/tenant-provisioning.service';
import { OrgSignupDto } from './dto/org-signup.dto';
import { SigninDto } from './dto/signin.dto';
import { RefreshDto } from './dto/refresh.dto';
import { CandidateSignupDto } from './dto/candidate-auth.dto';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';
import { SuperAdminRepository } from '../../repositories/super-admin.repository';
import { TenantRepository } from '../../repositories/tenant.repository';

@Injectable()
export class AuthService {
  constructor(
    private tenantProvisioning: TenantProvisioningService,
    private tokenService: TokenService,
    private userEmailRepo: UserEmailRepository,
    private userRepo: UserRepository,
    private candidateAccountRepo: CandidateAccountRepository,
    private superAdminRepo: SuperAdminRepository,
    private tenantRepo: TenantRepository,
  ) {}

  async orgSignup(dto: OrgSignupDto) {
    const { tenantId, userId } =
      await this.tenantProvisioning.createTenant(dto);
    const tokens = await this.tokenService.issueTokens({
      id: userId,
      tenantId,
      role: 'OrgAdmin',
    });
    return { data: tokens, message: 'Company created' };
  }

  async signin(dto: SigninDto) {
    const emailRecord = await this.userEmailRepo.findByEmail(dto.email);
    if (emailRecord) {
      const user = await this.userRepo.findByEmail(
        dto.email,
        `tenant_${emailRecord.tenantId}`,
      );
      if (!user) throw new UnauthorizedException('Invalid credentials');
      const valid = await verifyPassword(user.passwordHash, dto.password);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      const tenant = await this.tenantRepo.findById(emailRecord.tenantId);
      if (tenant?.status === 'suspended') {
        throw new ForbiddenException('This company account is suspended');
      }

      const tokens = await this.tokenService.issueTokens({
        id: user.id,
        tenantId: emailRecord.tenantId,
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
        tenantId: null,
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
      tenantId: null,
      role: 'SuperAdmin',
    });
    return { data: tokens, message: 'Signed in' };
  }

  async candidateSignup(dto: CandidateSignupDto) {
    const existing = await this.candidateAccountRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already taken');
    const orgOwner = await this.userEmailRepo.findByEmail(dto.email);
    if (orgOwner) throw new ConflictException('Email already taken');

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
      tenantId: null,
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
}
