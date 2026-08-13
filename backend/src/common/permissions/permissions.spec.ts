import {
  ALL_PERMISSIONS,
  INTERNAL_ROLES,
  ROLE_PERMISSIONS,
  defaultPresetFor,
  isInternalRole,
  isPermission,
} from './permissions';

describe('permissions catalog', () => {
  it('exposes 17 permissions and 4 roles', () => {
    expect(ALL_PERMISSIONS).toHaveLength(17);
    expect(INTERNAL_ROLES).toEqual([
      'CompanyAdmin',
      'Recruiter',
      'HiringManager',
      'Interviewer',
    ]);
  });

  it('every role preset is a subset of ALL_PERMISSIONS and non-empty', () => {
    for (const role of INTERNAL_ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(ALL_PERMISSIONS).toContain(perm);
      }
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('role presets shrink with seniority (CA >= Recruiter >= HM >= Interviewer)', () => {
    const count = (r: (typeof INTERNAL_ROLES)[number]) =>
      ROLE_PERMISSIONS[r].length;
    expect(count('CompanyAdmin')).toBeGreaterThan(count('Recruiter'));
    expect(count('Recruiter')).toBeGreaterThan(count('HiringManager'));
    expect(count('HiringManager')).toBeGreaterThan(count('Interviewer'));
  });

  it('CA default contains the management permissions', () => {
    for (const p of [
      'users.manage',
      'settings.manage',
      'permissions.manage',
      'stages.manage',
    ]) {
      expect(ROLE_PERMISSIONS.CompanyAdmin).toContain(p);
    }
  });

  it('defaultPresetFor returns a fresh copy', () => {
    const a = defaultPresetFor('Recruiter');
    a.push('jobs.delete');
    expect(defaultPresetFor('Recruiter')).not.toContain('jobs.delete');
  });

  it('type guards work', () => {
    expect(isInternalRole('Recruiter')).toBe(true);
    expect(isInternalRole('Candidate')).toBe(false);
    expect(isPermission('jobs.view')).toBe(true);
    expect(isPermission('everything')).toBe(false);
  });
});
