import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { asyncStorage, TenantContext } from './tenant-context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as TenantContext | undefined;

    const ctx: TenantContext = user
      ? { tenantId: user.tenantId, userId: user.userId, role: user.role }
      : { tenantId: 'public', userId: '', role: 'anonymous' };

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
