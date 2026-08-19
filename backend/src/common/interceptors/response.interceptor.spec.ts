import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

const dummyCtx = {} as ExecutionContext;

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('wraps a plain payload as { data, message: "OK" }', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(dummyCtx, makeHandler({ id: 1 })),
    );
    expect(out).toEqual({ data: { id: 1 }, message: 'OK' });
  });

  it('passes through explicit envelopes (object with both data + message keys)', async () => {
    const envelope = { data: { accessToken: 'abc' }, message: 'Signed in' };
    const out = await firstValueFrom(
      interceptor.intercept(dummyCtx, makeHandler(envelope)),
    );
    expect(out).toEqual(envelope);
  });

  it('does NOT treat arrays as envelopes (arrays lack own message key)', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(dummyCtx, makeHandler([1, 2, 3])),
    );
    expect(out).toEqual({ data: [1, 2, 3], message: 'OK' });
  });

  it('converts null/undefined returns to { data: null, message: "OK" }', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(dummyCtx, makeHandler(null)),
    );
    expect(out).toEqual({ data: null, message: 'OK' });
  });

  it('treats { message: "x" } (no data key) as a plain payload', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(dummyCtx, makeHandler({ message: 'Logged out' })),
    );
    expect(out).toEqual({ data: { message: 'Logged out' }, message: 'OK' });
  });
});
