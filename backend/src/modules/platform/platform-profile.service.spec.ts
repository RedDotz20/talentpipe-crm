import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { asyncStorage } from '@/common/context/company-context';
import { SuperAdminRepository } from '@/repositories/super-admin.repository';
import { AvatarsService } from '@/modules/avatars/avatars.service';
import { PlatformProfileService } from '@/modules/platform/platform-profile.service';

describe('PlatformProfileService', () => {
  let service: PlatformProfileService;
  const superAdminRepo = {
    findById: jest.fn(),
    updateName: jest.fn(),
    updateAvatarUrl: jest.fn(),
  };
  const avatarsService = { store: jest.fn(), delete: jest.fn() };

  const run = <T>(fn: () => Promise<T>): Promise<T> =>
    asyncStorage.run(
      { companyId: 'public', userId: 's1', role: 'SuperAdmin' },
      fn,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformProfileService,
        { provide: SuperAdminRepository, useValue: superAdminRepo },
        { provide: AvatarsService, useValue: avatarsService },
      ],
    }).compile();
    service = module.get(PlatformProfileService);
  });

  it('returns the super admin profile', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Super Admin',
      avatarUrl: 'platform/avatars/s1/x.png',
    });
    const result = await run(() => service.get());
    expect(result).toMatchObject({
      id: 's1',
      name: 'Super Admin',
      avatarUrl: 'platform/avatars/s1/x.png',
    });
  });

  it('uploads an avatar under the platform key prefix', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Super Admin',
      avatarUrl: null,
    });
    avatarsService.store.mockResolvedValue('platform/avatars/s1/new.png');
    superAdminRepo.updateAvatarUrl.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Super Admin',
      avatarUrl: 'platform/avatars/s1/new.png',
    });

    const result = await run(() =>
      service.uploadAvatar({ mimetype: 'image/png' } as Express.Multer.File),
    );

    expect(avatarsService.store).toHaveBeenCalledWith(
      { type: 'superAdmin', id: 's1' },
      { mimetype: 'image/png' },
    );
    expect(superAdminRepo.updateAvatarUrl).toHaveBeenCalledWith(
      's1',
      'platform/avatars/s1/new.png',
    );
    expect(result).toEqual({ avatarUrl: 'platform/avatars/s1/new.png' });
  });

  it('updates the display name', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Super Admin',
      avatarUrl: null,
    });
    superAdminRepo.updateName.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Grace Hopper',
      avatarUrl: null,
    });

    const result = await run(() => service.update({ name: 'Grace Hopper' }));

    expect(superAdminRepo.updateName).toHaveBeenCalledWith(
      's1',
      'Grace Hopper',
    );
    expect(result.name).toBe('Grace Hopper');
  });

  it('no-ops when no name is provided', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Super Admin',
      avatarUrl: null,
    });

    const result = await run(() => service.update({}));

    expect(superAdminRepo.updateName).not.toHaveBeenCalled();
    expect(result.name).toBe('Super Admin');
  });

  it('removes the avatar', async () => {
    superAdminRepo.findById.mockResolvedValue({
      id: 's1',
      email: 'sa@talentpipe.com',
      name: 'Super Admin',
      avatarUrl: 'platform/avatars/s1/x.png',
    });
    const result = await run(() => service.removeAvatar());
    expect(avatarsService.delete).toHaveBeenCalledWith(
      'platform/avatars/s1/x.png',
    );
    expect(superAdminRepo.updateAvatarUrl).toHaveBeenCalledWith('s1', null);
    expect(result).toEqual({ avatarUrl: null });
  });

  it('404s when the admin row is gone', async () => {
    superAdminRepo.findById.mockResolvedValue(null);
    await expect(run(() => service.get())).rejects.toThrow(NotFoundException);
  });
});
