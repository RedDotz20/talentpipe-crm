import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { DrizzleSchemaService } from '../../database/drizzle-schema.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { UserRepository } from '../../repositories/user.repository';
import { CandidateAccountRepository } from '../../repositories/candidate-account.repository';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        {
          provide: DrizzleSchemaService,
          useValue: {
            forPublic: jest.fn(),
            forSchema: jest.fn(),
            forCurrentTenant: jest.fn(),
          },
        },
        {
          provide: TenantRepository,
          useValue: { findBySlug: jest.fn() },
        },
        {
          provide: UserRepository,
          useValue: {},
        },
        {
          provide: CandidateAccountRepository,
          useValue: { findByEmail: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
