import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { asyncStorage, CompanyContext } from '@/common/context/company-context';

@Injectable()
export class CompanyContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: CompanyContext }>();
    const user = request.user;

    const companyId =
      user?.role === 'SuperAdmin' || !user?.companyId
        ? 'public'
        : user.companyId;

    const ctx: CompanyContext = user
      ? {
          companyId,
          userId: user.userId,
          role: user.role,
        }
      : { companyId: 'public', userId: '', role: 'anonymous' };

    return new Observable((subscriber) => {
      asyncStorage.run(ctx, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
