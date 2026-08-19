import { Injectable, NotFoundException } from '@nestjs/common';
import { getCompanyId, getCurrentUser } from '@/common/context/company-context';
import { AvatarsService } from '@/common/avatars/avatars.service';
import { UserRepository } from '@/repositories/user.repository';
import { UpdateCompanyProfileDto } from '@/modules/company/dto/update-profile.dto';

interface ProfileRow {
  id: string;
  email: string;
  role: string;
  name: string | null;
  avatarUrl: string | null;
  status: string;
}

@Injectable()
export class CompanyProfileService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly avatarsService: AvatarsService,
  ) {}

  private async requireSelf(): Promise<ProfileRow> {
    const user = await this.userRepo.findById(getCurrentUser().userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private map(user: ProfileRow) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      avatarUrl: user.avatarUrl,
      status: user.status,
    };
  }

  async get() {
    return this.map(await this.requireSelf());
  }

  async update(dto: UpdateCompanyProfileDto) {
    const user = await this.requireSelf();
    if (dto.name === undefined) return this.map(user);
    const updated = await this.userRepo.updateName(user.id, dto.name);
    if (!updated) throw new NotFoundException('User not found');
    return this.map(updated);
  }

  async uploadAvatar(file: Express.Multer.File) {
    const user = await this.requireSelf();
    const key = await this.avatarsService.store(
      { type: 'companyUser', id: user.id, companyId: getCompanyId() },
      file,
    );
    if (user.avatarUrl) await this.avatarsService.delete(user.avatarUrl);
    const updated = await this.userRepo.updateAvatarUrl(user.id, key);
    if (!updated) throw new NotFoundException('User not found');
    return { avatarUrl: updated.avatarUrl };
  }

  async removeAvatar() {
    const user = await this.requireSelf();
    if (user.avatarUrl) await this.avatarsService.delete(user.avatarUrl);
    await this.userRepo.updateAvatarUrl(user.id, null);
    return { avatarUrl: null };
  }
}
