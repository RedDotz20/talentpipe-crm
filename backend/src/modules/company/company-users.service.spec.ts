import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { asyncStorage } from '../../common/context/company-context';
import { AuditService } from '../../common/audit/audit.service';
import { CompanyUsersService } from './company-users.service';
import { UserRepository } from '../../repositories/user.repository';
import { UserEmailRepository } from '../../repositories/user-email.repository';
import { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import { InterviewRepository } from '../../repositories/interview.repository';

jest.mock('../../common/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

describe('CompanyUsersService', () => {
  let service: CompanyUsersService;
  const userRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'u2' }),
    updateRole: jest
      .fn()
      .mockResolvedValue({ id: 'u2', email: 'a@b.com', role: 'Recruiter' }),
    updateStatus: jest.fn().mockResolvedValue({
      id: 'u2',
      email: 'u2@acme.com',
      role: 'Recruiter',
      status: 'suspended',
    }),
    resetPassword: jest.fn().mockResolvedValue({
      id: 'u2',
      email: 'u2@acme.com',
      passwordHash: 'hashed',
    }),
    remove: jest.fn(),
  };
  const userEmailRepo = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    deleteByUserId: jest.fn(),
  };
  const refreshTokenRepo = { deleteByUser: jest.fn() };
  const interviewRepo = { deleteByInterviewer: jest.fn() };
  const auditService = { log: jest.fn() };

  const runAs = <T>(fn: () => Promise<T>) =>
    asyncStorage.run(
      { companyId: 't1', userId: 'me', role: 'CompanyAdmin' },
      fn,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyUsersService,
        { provide: UserRepository, useValue: userRepo },
        { provide: UserEmailRepository, useValue: userEmailRepo },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepo },
        { provide: InterviewRepository, useValue: interviewRepo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get<CompanyUsersService>(CompanyUsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rejects duplicate emails', async () => {
      userEmailRepo.findByEmail.mockResolvedValue({ id: 'e1' });
      await expect(
        runAs(() =>
          service.create({
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
        service.create({
          email: 'new@acme.com',
          role: 'Interviewer',
          password: 'password1',
        }),
      );
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@acme.com', role: 'Interviewer' }),
        'company_t1',
      );
      expect(userEmailRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@acme.com', companyId: 't1' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        'user.create',
        expect.any(String),
        { email: 'new@acme.com', role: 'Interviewer' },
      );
      expect(result).toEqual(
        expect.objectContaining({ email: 'new@acme.com', role: 'Interviewer' }),
      );
    });
  });

  describe('setStatus', () => {
    it('blocks suspending your own account', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'me',
        email: 'me@acme.com',
        role: 'CompanyAdmin',
        status: 'active',
      });
      await expect(
        runAs(() => service.setStatus('me', 'suspended')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks suspending the last active CompanyAdmin', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'CompanyAdmin',
        status: 'active',
      });
      userRepo.findAll.mockResolvedValue([
        {
          id: 'u2',
          email: 'u2@acme.com',
          role: 'CompanyAdmin',
          status: 'active',
        },
      ]);
      await expect(
        runAs(() => service.setStatus('u2', 'suspended')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a status change when already in that status', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
        status: 'suspended',
      });
      await expect(
        runAs(() => service.setStatus('u2', 'suspended')),
      ).rejects.toThrow(ConflictException);
    });

    it('suspends, deletes refresh tokens, and audits', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
        status: 'active',
      });
      userRepo.findAll.mockResolvedValue([
        {
          id: 'me',
          email: 'me@acme.com',
          role: 'CompanyAdmin',
          status: 'active',
        },
        { id: 'u2', email: 'u2@acme.com', role: 'Recruiter', status: 'active' },
      ]);
      const result = await runAs(() => service.setStatus('u2', 'suspended'));
      expect(userRepo.updateStatus).toHaveBeenCalledWith('u2', 'suspended');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u2');
      expect(auditService.log).toHaveBeenCalledWith('user.suspend', 'u2', {
        email: 'u2@acme.com',
      });
      expect(result.status).toBe('suspended');
    });

    it('reactivates and audits', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
        status: 'suspended',
      });
      userRepo.updateStatus.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
        status: 'active',
      });
      const result = await runAs(() => service.setStatus('u2', 'active'));
      expect(userRepo.updateStatus).toHaveBeenCalledWith('u2', 'active');
      expect(refreshTokenRepo.deleteByUser).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith('user.reactivate', 'u2', {
        email: 'u2@acme.com',
      });
      expect(result.status).toBe('active');
    });
  });

  describe('resetPassword', () => {
    it('blocks resetting your own password', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'me',
        email: 'me@acme.com',
        role: 'CompanyAdmin',
      });
      await expect(
        runAs(() => service.resetPassword('me', { password: 'NewPass123' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hashes the new password, revokes sessions, and audits', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'Recruiter',
      });
      await runAs(() =>
        service.resetPassword('u2', { password: 'NewPass123' }),
      );
      expect(userRepo.resetPassword).toHaveBeenCalledWith('u2', 'hashed');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u2');
      expect(auditService.log).toHaveBeenCalledWith(
        'user.password_reset',
        'u2',
        { email: 'u2@acme.com' },
      );
    });
  });

  describe('updateRole', () => {
    it('blocks changing your own role', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'me',
        email: 'me@acme.com',
        role: 'CompanyAdmin',
      });
      await expect(
        runAs(() => service.updateRole('me', { role: 'Recruiter' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks removing the last CompanyAdmin', async () => {
      userRepo.findById.mockResolvedValue({
        id: 'u2',
        email: 'u2@acme.com',
        role: 'CompanyAdmin',
      });
      userRepo.findAll.mockResolvedValue([
        { id: 'u2', email: 'u2@acme.com', role: 'CompanyAdmin' },
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
        { id: 'me', email: 'me@acme.com', role: 'CompanyAdmin' },
        { id: 'u2', email: 'u2@acme.com', role: 'Recruiter' },
      ]);
      const result = await runAs(() =>
        service.updateRole('u2', { role: 'HiringManager' }),
      );
      expect(userRepo.updateRole).toHaveBeenCalledWith('u2', 'HiringManager');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u2');
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
        role: 'CompanyAdmin',
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
        { id: 'me', email: 'me@acme.com', role: 'CompanyAdmin' },
        { id: 'u2', email: 'u2@acme.com', role: 'Recruiter' },
      ]);
      await runAs(() => service.remove('u2'));
      expect(interviewRepo.deleteByInterviewer).toHaveBeenCalledWith('u2');
      expect(userRepo.remove).toHaveBeenCalledWith('u2');
      expect(userEmailRepo.deleteByUserId).toHaveBeenCalledWith('u2');
      expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith('u2');
      expect(auditService.log).toHaveBeenCalledWith('user.remove', 'u2', {
        email: 'u2@acme.com',
      });
    });
  });
});
