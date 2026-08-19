import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { asyncStorage } from '@/common/context/company-context';
import { UserRepository } from '@/repositories/user.repository';
import { AvatarsService } from '@/common/avatars/avatars.service';
import { CompanyProfileService } from '@/modules/company/company-profile.service';

describe('CompanyProfileService', () => {
  let service: CompanyProfileService;
  const userRepo = {
    findById: jest.fn(),
    updateName: jest.fn(),
    updateAvatarUrl: jest.fn(),
  };
  const avatarsService = { store: jest.fn(), delete: jest.fn() };

  const run = <T>(fn: () => Promise<T>): Promise<T> =>
    asyncStorage.run({ companyId: 't1', userId: 'u1', role: 'Recruiter' }, fn);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyProfileService,
        { provide: UserRepository, useValue: userRepo },
        { provide: AvatarsService, useValue: avatarsService },
      ],
    }).compile();
    service = module.get(CompanyProfileService);
  });

  it('returns the current user profile', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'u1',
      email: 'rec@acme.com',
      role: 'Recruiter',
      name: 'Ada Lovelace',
      avatarUrl: null,
      status: 'active',
    });
    const result = await run(() => service.get());
    expect(result).toMatchObject({
      id: 'u1',
      name: 'Ada Lovelace',
      avatarUrl: null,
    });
  });

  it('updates the display name', async () => {
    userRepo.updateName.mockResolvedValue({
      id: 'u1',
      email: 'rec@acme.com',
      role: 'Recruiter',
      name: 'Grace Hopper',
      avatarUrl: null,
      status: 'active',
    });
    const result = await run(() => service.update({ name: 'Grace Hopper' }));
    expect(userRepo.updateName).toHaveBeenCalledWith('u1', 'Grace Hopper');
    expect(result.name).toBe('Grace Hopper');
  });

  it('uploads an avatar with the company-scoped key and deletes the old object', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'u1',
      email: 'rec@acme.com',
      role: 'Recruiter',
      name: 'Ada',
      avatarUrl: 'companies/t1/avatars/u1/old.png',
      status: 'active',
    });
    avatarsService.store.mockResolvedValue('companies/t1/avatars/u1/new.png');
    userRepo.updateAvatarUrl.mockResolvedValue({
      id: 'u1',
      email: 'rec@acme.com',
      role: 'Recruiter',
      name: 'Ada',
      avatarUrl: 'companies/t1/avatars/u1/new.png',
      status: 'active',
    });

    const result = await run(() =>
      service.uploadAvatar({ mimetype: 'image/png' } as Express.Multer.File),
    );

    expect(avatarsService.store).toHaveBeenCalledWith(
      { type: 'companyUser', id: 'u1', companyId: 't1' },
      { mimetype: 'image/png' },
    );
    expect(avatarsService.delete).toHaveBeenCalledWith(
      'companies/t1/avatars/u1/old.png',
    );
    expect(userRepo.updateAvatarUrl).toHaveBeenCalledWith(
      'u1',
      'companies/t1/avatars/u1/new.png',
    );
    expect(result).toEqual({ avatarUrl: 'companies/t1/avatars/u1/new.png' });
  });

  it('removes the avatar', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'u1',
      email: 'rec@acme.com',
      role: 'Recruiter',
      name: 'Ada',
      avatarUrl: 'companies/t1/avatars/u1/x.png',
      status: 'active',
    });
    const result = await run(() => service.removeAvatar());
    expect(avatarsService.delete).toHaveBeenCalledWith(
      'companies/t1/avatars/u1/x.png',
    );
    expect(userRepo.updateAvatarUrl).toHaveBeenCalledWith('u1', null);
    expect(result).toEqual({ avatarUrl: null });
  });

  it('404s when the user row is gone', async () => {
    userRepo.findById.mockResolvedValue(null);
    await expect(run(() => service.get())).rejects.toThrow(NotFoundException);
  });
});
