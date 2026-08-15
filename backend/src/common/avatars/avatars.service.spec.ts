import { BadRequestException } from '@nestjs/common';
import { AvatarsService } from './avatars.service';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png'),
]);

describe('AvatarsService', () => {
  const storage = { upload: jest.fn(), delete: jest.fn(), get: jest.fn() };
  let service: AvatarsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AvatarsService(storage as never);
  });

  it('stores a png under the candidate key prefix', async () => {
    const key = await service.store({ type: 'candidate', id: 'c1' }, {
      mimetype: 'image/png',
      buffer: PNG,
      size: PNG.length,
    } as Express.Multer.File);
    expect(key).toMatch(/^candidate-avatars\/c1\/[0-9a-f-]{36}\.png$/);
    expect(storage.upload).toHaveBeenCalledWith(
      key,
      PNG,
      'image/png',
      'avatars',
    );
  });

  it('stores under the company-user key prefix with the company id', async () => {
    const key = await service.store(
      { type: 'companyUser', id: 'u1', companyId: 't1' },
      {
        mimetype: 'image/png',
        buffer: PNG,
        size: PNG.length,
      } as Express.Multer.File,
    );
    expect(key).toMatch(/^companies\/t1\/avatars\/u1\/[0-9a-f-]{36}\.png$/);
  });

  it('stores under the super-admin key prefix', async () => {
    const key = await service.store({ type: 'superAdmin', id: 's1' }, {
      mimetype: 'image/png',
      buffer: PNG,
      size: PNG.length,
    } as Express.Multer.File);
    expect(key).toMatch(/^platform\/avatars\/s1\/[0-9a-f-]{36}\.png$/);
  });

  it('rejects an unsupported mime type', async () => {
    await expect(
      service.store({ type: 'candidate', id: 'c1' }, {
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-'),
        size: 5,
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects content that does not match the declared mime type', async () => {
    await expect(
      service.store({ type: 'candidate', id: 'c1' }, {
        mimetype: 'image/png',
        buffer: Buffer.from('not-an-image'),
        size: 12,
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects oversized files', async () => {
    await expect(
      service.store({ type: 'candidate', id: 'c1' }, {
        mimetype: 'image/png',
        buffer: Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]),
        size: PNG.length + 6 * 1024 * 1024,
      } as Express.Multer.File),
    ).rejects.toThrow(BadRequestException);
  });

  it('only accepts avatar-shaped keys for serving', () => {
    expect(service.isAvatarKey('candidate-avatars/c1/abc.png')).toBe(true);
    expect(service.isAvatarKey('platform/avatars/s1/abc.jpg')).toBe(true);
    expect(
      service.isAvatarKey(
        'companies/0b9f9b9e-9c2a-4c1e-8f3d-1234567890ab/avatars/u1/abc.webp',
      ),
    ).toBe(true);
    expect(
      service.isAvatarKey(
        'companies/0b9f9b9e-9c2a-4c1e-8f3d-1234567890ab/resumes/u1/abc.pdf',
      ),
    ).toBe(false);
    expect(service.isAvatarKey('../../etc/passwd')).toBe(false);
  });
});
