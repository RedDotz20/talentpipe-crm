import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/tenant-context';
import { AuditService } from '../../common/audit/audit.service';
import { OrgUsersService } from './org-users.service';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';

jest.mock('../../common/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

describe('OrgUsersService', () => {
  let service: OrgUsersService;
  const userRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'u2' }),
    updateRole: jest
      .fn()
      .mockResolvedValue({ id: 'u2', email: 'a@b.com', role: 'Recruiter' }),
    remove: jest.fn(),
  };
  const userEmailRepo = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    deleteByUserId: jest.fn(),
  };
  const refreshTokenRepo = { deleteByUser: jest.fn() };
  const auditService = { log: jest.fn() };

  const runAs = <T>(fn: () => Promise<T>) =>
    asyncStorage.run({ tenantId: 't1', userId: 'me', role: 'OrgAdmin' }, fn);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgUsersService,
        { provide: UserRepository, useValue: userRepo },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get<OrgUsersService>(OrgUsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invite', () => {
    it('rejects duplicate emails', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({ id: 'e1' });
      await expect(
        runAs(() =>
          service.invite({
            email: 'dup@acme.com',
            role: 'Recruiter',
            password: 'password1',
          }),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the tenant user, the email bridge, and an audit row', async () => {
      userEmailRepo.findByEmail.mockResolvedValue(null);
      const result = await runAs(() =>
        service.invite({
          email: 'new@acme.com',
          role: 'Interviewer',
          password: 'password1',
        }),
      );
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@acme.com', role: 'Interviewer' }),
        'tenant_t1',
      );
      expect(userEmailRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@acme.com', tenantId: 't1' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        'user.invite',
        expect.any(String),
        { email: 'new@acme.com', role: 'Interviewer' },
      );
      expect(result).toEqual(
        expect.objectContaining({ email: 'new@acme.com', role: 'Interviewer' }),
      );
    });
  });

  describe('updateRole', () => {
    it('blocks changing your own role', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'me',
        email: 'me@acme.com',
        role: 'OrgAdmin',
      });
      await expect(
        runAs(() => service.updateRole('me', { role: 'Recruiter' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks removing the last OrgAdmin', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'OrgAdmin',
      });
      userRepo.findAll.mockResolvedValue([
        { id: 'u2', email: 'u2@acme.com', role: 'OrgAdmin' },
      ]);
      await expect(
        runAs(() => service.updateRole('u2', { role: 'Recruiter' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('changes the role and audits it', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
      });
      userRepo.findAll.mockResolvedValue([
        { id: 'me', email: 'me@acme.com', role: 'OrgAdmin' },
        { id: 'u2', email: 'u2@acme.com', role: 'Recruiter' },
      ]);
      const result = await runAs(() =>
        service.updateRole('u2', { role: 'HiringManager' }),
      );
      expect(userRepo.updateRole).toHaveBeenCalledWith('u2', 'HiringManager');
      expect(auditService.log).toHaveBeenCalledWith('user.role_change', 'u2', {
        fromRole: 'Recruiter',
        toRole: 'HiringManager',
      });
      expect(result.role).toBe('Recruiter');
    });
  });

  describe('remove', () => {
    it('blocks removing yourself', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'me',
        email: 'me@acme.com',
        role: 'OrgAdmin',
      });
      await expect(runAs(() => service.remove('me'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('removes user, email bridge, and refresh tokens with an audit row', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
      });
      userRepo.findAll.mockResolvedValue([
        { id: 'me', email: 'me@acme.com', role: 'OrgAdmin' },
        { id: 'u2', email: 'u2@acme.com', role: 'Recruiter' },
      ]);
      await runAs(() => service.remove('u2'));
      expect(userRepo.remove).toHaveBeenCalledWith('u2');
      expect(userEmailRepo.deleteByUserId).toHaveBeenCalledWith('u2');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u2');
      expect(auditService.log).toHaveBeenCalledWith('user.remove', 'u2', {
        email: 'u2@acme.com',
      });
    });
  });
});
