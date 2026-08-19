import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionRepository } from '@/repositories/permission.repository';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionRepo: PermissionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { userId: string; companyId: string | null; role: string };
    }>();
    const user = request.user;
    if (!user) return true;
    if (user.role === 'SuperAdmin' || user.role === 'Candidate') return true;
    if (!user.companyId) return true;

    const effective = await this.permissionRepo.findEffectivePermissions(
      user.userId,
      `company_${user.companyId}`,
    );
    if (required.every((p) => effective.includes(p))) return true;

    throw new ForbiddenException(
      'You do not have permission to perform this action',
    );
  }
}
