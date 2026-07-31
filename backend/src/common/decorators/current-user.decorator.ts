import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../context/tenant-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<{ user: TenantContext }>();
    return request.user;
  },
);
