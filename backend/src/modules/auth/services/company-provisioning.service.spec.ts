import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CompanyProvisioningService } from '@/modules/auth/services/company-provisioning.service';
import { CompanyRepository } from '@/repositories/company.repository';
import { UserRepository } from '@/repositories/user.repository';
import { UserEmailRepository } from '@/repositories/user-email.repository';
import { PipelineStageRepository } from '@/repositories/pipeline-stage.repository';

jest.mock('crypto', () => ({ randomUUID: jest.fn(() => 'uuid-1') }));
jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hash'),
  verify: jest.fn(),
}));

describe('CompanyProvisioningService', () => {
  let service: CompanyProvisioningService;
  const tenantRepo = {
    findBySlug: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'uuid-1' }),
    provisionSchema: jest.fn().mockResolvedValue(undefined),
  };
  const userRepo = { create: jest.fn().mockResolvedValue({ id: 'uuid-1' }) };
  const userEmailRepo = {
    findByEmail: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'e1' }),
  };
  const pipelineStageRepo = {
    createMany: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyProvisioningService,
        { provide: CompanyRepository, useValue: tenantRepo },
        { provide: UserRepository, useValue: userRepo },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: PipelineStageRepository, useValue: pipelineStageRepo },
      ],
    }).compile();
    service = module.get<CompanyProvisioningService>(
      CompanyProvisioningService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws ConflictException when the slug is already taken', async () => {
    tenantRepo.findBySlug.mockResolvedValue({ id: 'x' });
    await expect(
      service.createTenant({
        companyName: 'Acme',
        slug: 'acme',
        email: 'admin@acme.com',
        password: 'password1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates tenant, provisions schema, seeds user + stages + email link', async () => {
    tenantRepo.findBySlug.mockResolvedValue(null);
    const result = await service.createTenant({
      companyName: 'Acme',
      slug: 'acme',
      email: 'admin@acme.com',
      password: 'password1',
    });

    expect(result).toEqual({ companyId: 'uuid-1', userId: 'uuid-1' });
    expect(tenantRepo.create).toHaveBeenCalledWith({
      id: 'uuid-1',
      name: 'Acme',
      slug: 'acme',
    });
    expect(tenantRepo.provisionSchema).toHaveBeenCalledWith('uuid-1');
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@acme.com',
        role: 'CompanyAdmin',
      }),
      'company_uuid-1',
    );
    expect(pipelineStageRepo.createMany).toHaveBeenCalledWith(
      ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'],
      'company_uuid-1',
    );
    expect(userEmailRepo.create).toHaveBeenCalledWith({
      email: 'admin@acme.com',
      companyId: 'uuid-1',
      userId: 'uuid-1',
    });
  });
});
