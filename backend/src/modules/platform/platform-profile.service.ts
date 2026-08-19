import { Injectable, NotFoundException } from '@nestjs/common';
import { getCurrentUser } from '@/common/context/company-context';
import { AvatarsService } from '@/modules/avatars/avatars.service';
import { SuperAdminRepository } from '@/repositories/super-admin.repository';
import { UpdatePlatformProfileDto } from '@/modules/platform/dto/update-profile.dto';

@Injectable()
export class PlatformProfileService {
  constructor(
    private readonly superAdminRepo: SuperAdminRepository,
    private readonly avatarsService: AvatarsService,
  ) {}

  private async requireSelf() {
    const admin = await this.superAdminRepo.findById(getCurrentUser().userId);
    if (!admin) throw new NotFoundException('SuperAdmin not found');
    return admin;
  }

  private map(admin: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  }) {
    return {
      id: admin.id,
      email: admin.email,
      role: 'SuperAdmin',
      name: admin.name,
      avatarUrl: admin.avatarUrl,
    };
  }

  async get() {
    return this.map(await this.requireSelf());
  }

  async update(dto: UpdatePlatformProfileDto) {
    const admin = await this.requireSelf();
    if (dto.name === undefined) return this.map(admin);
    const updated = await this.superAdminRepo.updateName(admin.id, dto.name);
    if (!updated) throw new NotFoundException('SuperAdmin not found');
    return this.map(updated);
  }

  async uploadAvatar(file: Express.Multer.File) {
    const admin = await this.requireSelf();
    const key = await this.avatarsService.store(
      { type: 'superAdmin', id: admin.id },
      file,
    );
    if (admin.avatarUrl) await this.avatarsService.delete(admin.avatarUrl);
    const updated = await this.superAdminRepo.updateAvatarUrl(admin.id, key);
    if (!updated) throw new NotFoundException('SuperAdmin not found');
    return { avatarUrl: updated.avatarUrl };
  }

  async removeAvatar() {
    const admin = await this.requireSelf();
    if (admin.avatarUrl) await this.avatarsService.delete(admin.avatarUrl);
    await this.superAdminRepo.updateAvatarUrl(admin.id, null);
    return { avatarUrl: null };
  }
}
