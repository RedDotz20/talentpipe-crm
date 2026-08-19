import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

describe('ZodValidationPipe', () => {
  it('returns parsed data for a valid payload', () => {
    const pipe = new ZodValidationPipe(Schema);
    const out = pipe.transform({ email: 'a@b.co', password: 'longenough' });
    expect(out).toEqual({ email: 'a@b.co', password: 'longenough' });
  });

  it('throws BadRequestException with issue messages on an invalid payload', () => {
    const pipe = new ZodValidationPipe(Schema);
    try {
      pipe.transform({ email: 'nope', password: 'short' });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as BadRequestException;
      const resp = err.getResponse() as { message: string[] };
      expect(resp.message.length).toBeGreaterThan(0);
    }
  });
});
