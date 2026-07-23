import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class CandidateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    return user?.role === 'Candidate';
  }
}
