import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  message: string;
}

const DEFAULT_MESSAGE = 'OK';

function isExplicitEnvelope(
  value: unknown,
): value is { data: unknown; message: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(obj, 'data') &&
    Object.prototype.hasOwnProperty.call(obj, 'message')
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        if (isExplicitEnvelope(value)) {
          return value as unknown as ApiResponse<T>;
        }
        return { data: (value ?? null) as T, message: DEFAULT_MESSAGE };
      }),
    );
  }
}
