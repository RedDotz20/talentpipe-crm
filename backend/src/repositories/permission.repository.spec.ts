import { resolveEffectivePermissions } from './permission.repository';

describe('resolveEffectivePermissions', () => {
  it('prefers the local (company) preset', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: ['jobs.view'],
      presetGlobalPermissions: ['interviews.view'],
      role: 'Recruiter',
    });
    expect(result).toEqual(['jobs.view']);
  });

  it('falls back to the global (public) preset', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: null,
      presetGlobalPermissions: ['interviews.view', 'interviews.feedback'],
      role: 'Recruiter',
    });
    expect(result).toEqual(['interviews.view', 'interviews.feedback']);
  });

  it('falls back to the role default when no preset exists', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: null,
      presetGlobalPermissions: null,
      role: 'Interviewer',
    });
    expect(result).toEqual([
      'interviews.view',
      'interviews.feedback',
      'dashboard.view',
    ]);
  });

  it('returns [] for unknown roles', () => {
    const result = resolveEffectivePermissions({
      presetPermissions: null,
      presetGlobalPermissions: null,
      role: 'Candidate',
    });
    expect(result).toEqual([]);
  });
});
