### Task 1: Permission catalog constants

**Files:**
- Create: `backend/src/common/permissions/permissions.ts`
- Test: `backend/src/common/permissions/permissions.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const INTERNAL_ROLES = ['CompanyAdmin', 'Recruiter', 'HiringManager', 'Interviewer'] as const;`
  - `export type InternalRole = (typeof INTERNAL_ROLES)[number];`
  - `export type Permission = 'jobs.view' | 'jobs.create_edit' | ...` (all 17 keys)
  - `export const ALL_PERMISSIONS: Permission[]`
  - `export const ROLE_PERMISSIONS: Record<InternalRole, Permission[]>`
  - `export function isInternalRole(role: string): role is InternalRole`
  - `export function isPermission(value: string): value is Permission`
  - `export function defaultPresetFor(role: InternalRole): Permission[]` (returns a copy of `ROLE_PERMISSIONS[role]`)
  - `export function permissionsSubsetOfRole(role: InternalRole, permissions: string[]): permissions is Permission[]`

- [ ] **Step 1: Write the failing test**

`backend/src/common/permissions/permissions.spec.ts`:

```ts
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
    for (const p of ['users.manage', 'settings.manage', 'permissions.manage', 'stages.manage']) {
      expect(ROLE_PERMISSIONS.CompanyAdmin).toContain(p);
    }
  });

  it('defaultPresetFor returns a fresh copy', () => {
    const a = defaultPresetFor('Recruiter');
    a.push('jobs.delete' as never);
    expect(defaultPresetFor('Recruiter')).not.toContain('jobs.delete');
  });

  it('type guards work', () => {
    expect(isInternalRole('Recruiter')).toBe(true);
    expect(isInternalRole('Candidate')).toBe(false);
    expect(isPermission('jobs.view')).toBe(true);
    expect(isPermission('everything')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/common/permissions/permissions.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the catalog**

`backend/src/common/permissions/permissions.ts`:

```ts
export const INTERNAL_ROLES = [
  'CompanyAdmin',
  'Recruiter',
  'HiringManager',
  'Interviewer',
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export type Permission =
  | 'jobs.view'
  | 'jobs.create_edit'
  | 'jobs.publish_close'
  | 'jobs.delete'
  | 'candidates.view'
  | 'candidates.manage'
  | 'applications.view'
  | 'applications.move'
  | 'applications.note'
  | 'interviews.view'
  | 'interviews.schedule'
  | 'interviews.feedback'
  | 'stages.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'permissions.manage'
  | 'dashboard.view';

export const ALL_PERMISSIONS: Permission[] = [
  'jobs.view',
  'jobs.create_edit',
  'jobs.publish_close',
  'jobs.delete',
  'candidates.view',
  'candidates.manage',
  'applications.view',
  'applications.move',
  'applications.note',
  'interviews.view',
  'interviews.schedule',
  'interviews.feedback',
  'stages.manage',
  'settings.manage',
  'users.manage',
  'permissions.manage',
  'dashboard.view',
];

export const ROLE_PERMISSIONS: Record<InternalRole, Permission[]> = {
  CompanyAdmin: [...ALL_PERMISSIONS],
  Recruiter: [
    'jobs.view',
    'jobs.create_edit',
    'jobs.publish_close',
    'candidates.view',
    'candidates.manage',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'dashboard.view',
  ],
  HiringManager: [
    'jobs.view',
    'candidates.view',
    'applications.view',
    'applications.move',
    'applications.note',
    'interviews.view',
    'interviews.schedule',
    'dashboard.view',
  ],
  Interviewer: ['interviews.view', 'interviews.feedback', 'dashboard.view'],
};

export function isInternalRole(role: string): role is InternalRole {
  return (INTERNAL_ROLES as readonly string[]).includes(role);
}

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function defaultPresetFor(role: InternalRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function permissionsSubsetOfRole(
  role: InternalRole,
  permissions: string[],
): permissions is Permission[] {
  return permissions.every((p) =>
    ROLE_PERMISSIONS[role].includes(p as Permission),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/common/permissions/permissions.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run full backend checks**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/common/permissions
git commit -m "feat(m18): permission catalog constants"
```

---

