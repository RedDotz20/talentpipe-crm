import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CompanyContext } from '@/common/context/company-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CompanyContext => {
    const request = ctx.switchToHttp().getRequest<{ user: CompanyContext }>();
    return request.user;
  },
);
