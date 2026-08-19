import { ExecutionContext } from '@nestjs/common';
import { CandidateAuthGuard } from '@/common/guards/candidate-auth.guard';

function makeContext(user?: { role?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CandidateAuthGuard', () => {
  const guard = new CandidateAuthGuard();

  it('allows an authenticated candidate', () => {
    expect(guard.canActivate(makeContext({ role: 'Candidate' }))).toBe(true);
  });

  it('rejects unauthenticated requests', () => {
    expect(guard.canActivate(makeContext())).toBe(false);
  });

  it('rejects authenticated non-candidate users', () => {
    expect(guard.canActivate(makeContext({ role: 'Recruiter' }))).toBe(false);
  });
});
