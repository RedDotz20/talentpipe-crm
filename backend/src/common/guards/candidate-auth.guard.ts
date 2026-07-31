import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CandidateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();
    return user?.role === 'Candidate';
  }
}
