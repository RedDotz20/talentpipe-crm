### Task 2: Frontend — Update useAuthStore

**Files:**
- Modify: `frontend/src/shared/api/useAuth.ts`

**Interfaces:**
- Consumes: new backend endpoints (`/auth/signin`, `/auth/signup`, `/auth/org/signup`)
- Produces: store methods `signin()`, `candidateSignup()`, `orgSignup()`

- [ ] **Step 1: Update store — add `signin`, `candidateSignup`, `orgSignup`**

Replace the existing `login` and `signup` methods with new ones:

```typescript
  signin: async (email: string, password: string) => {
    const { data } = await api.post('/auth/signin', { email, password });
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('userId', payload.sub);
    if (payload.tenantId) {
      localStorage.setItem('tenantId', payload.tenantId);
    } else {
      localStorage.removeItem('tenantId');
    }
    localStorage.setItem('role', payload.role);
    set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId ?? null,
      role: payload.role,
    });
  },

  candidateSignup: async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    const { data: res } = await api.post('/auth/signup', data);
    const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.removeItem('tenantId');
    localStorage.setItem('role', payload.role);
    set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: payload.sub,
      tenantId: null,
      role: payload.role,
    });
  },

  orgSignup: async (data: {
    companyName: string;
    slug: string;
    email: string;
    password: string;
  }) => {
    const { data: res } = await api.post('/auth/org/signup', data);
    const payload = JSON.parse(atob(res.accessToken.split('.')[1]));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);
    localStorage.setItem('userId', payload.sub);
    localStorage.setItem('tenantId', payload.tenantId);
    localStorage.setItem('role', payload.role);
    set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    });
  },
```

Remove the old `login` and `signup` methods from the `AuthState` interface and store creator.

- [ ] **Step 2: Run lint**

Run: `cd frontend && npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/api/useAuth.ts
git commit -m "feat(auth): update store with signin/candidateSignup/orgSignup"
```

---

