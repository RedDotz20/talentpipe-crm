import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const KEY_PREFIXES = [
  'candidate-avatars/',
  'platform/avatars/',
  /^companies\/[0-9a-f-]{36}\/avatars\//,
] as const;

export type AvatarActor =
  | { type: 'candidate'; id: string }
  | { type: 'superAdmin'; id: string }
  | { type: 'companyUser'; id: string; companyId: string };

@Injectable()
export class AvatarsService {
  constructor(private readonly storage: StorageService) {}

  private assertSupportedType(mimeType: string) {
    if (!(mimeType in AVATAR_EXT)) {
      throw new BadRequestException(
        'Unsupported file type. Only PNG, JPEG and WebP are allowed.',
      );
    }
  }

  private assertSupportedContent(buffer: Buffer, mimeType: string) {
    const ok =
      mimeType === 'image/png'
        ? buffer
            .subarray(0, 8)
            .equals(
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
        : mimeType === 'image/jpeg'
          ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
          : mimeType === 'image/webp'
            ? buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
              buffer.subarray(8, 12).toString('ascii') === 'WEBP'
            : false;
    if (!ok) {
      throw new BadRequestException(
        'File content does not match an allowed image type (PNG, JPEG or WebP)',
      );
    }
  }

  // ponytail: no server-side resize — the 5MB cap + browser scaling suffice;
  // add `sharp` (resize + re-encode) only if storage/bandwidth costs matter.
  async store(actor: AvatarActor, file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Avatar must be 5MB or smaller');
    }
    this.assertSupportedType(file.mimetype);
    this.assertSupportedContent(file.buffer, file.mimetype);

    const prefix =
      actor.type === 'candidate'
        ? `candidate-avatars/${actor.id}`
        : actor.type === 'superAdmin'
          ? `platform/avatars/${actor.id}`
          : `companies/${actor.companyId}/avatars/${actor.id}`;
    const key = `${prefix}/${randomUUID()}.${AVATAR_EXT[file.mimetype]}`;
    await this.storage.upload(key, file.buffer, file.mimetype, AVATAR_BUCKET);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    return this.storage.get(key, AVATAR_BUCKET);
  }

  async delete(key: string) {
    await this.storage.delete(key, AVATAR_BUCKET);
  }

  // Restricts the generic serve endpoint to avatar-shaped keys so it can never
  // be used to read resumes or arbitrary objects.
  isAvatarKey(key: string): boolean {
    return KEY_PREFIXES.some((prefix) =>
      typeof prefix === 'string' ? key.startsWith(prefix) : prefix.test(key),
    );
  }

  contentTypeOf(key: string): string {
    if (key.endsWith('.png')) return 'image/png';
    if (key.endsWith('.jpg')) return 'image/jpeg';
    if (key.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }
}
