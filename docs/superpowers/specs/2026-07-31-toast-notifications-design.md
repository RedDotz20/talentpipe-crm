# Frontend Toast Notification System — Design

**Status:** Proposed
**Date:** 2026-07-31
**Milestone:** M1.5 (foundation, between M1 and M2)
**Scope:** Foundation only — backend envelope + frontend hook + provider. Migrating the in-page `<Alert>` on `SignInPage` is explicitly **out of scope** and deferred.

---

## Goal

Provide a single, consistent way to surface user-facing feedback (success and failure) for every backend-driven mutation in the app, with copy owned by the backend. Use Mantine's `@mantine/notifications` system and the canonical response envelope already documented in `AGENTS.md`.

## Non-goals

- Internationalization of toast strings.
- Per-feature toast styling (position, custom actions, undo buttons, etc.). Defaults are enough for M1.5.
- Replacing `<Alert>` UX on the signin page. Toasts and the existing inline alert co-exist until a later milestone consolidates failure UX.
- Setting up a frontend test runner. The project has none today; we defer hook unit tests to the M9 CI milestone.

---

## Background and context

`AGENTS.md`, `docs/00_PROJECT_INSTRUCTIONS.md`, and `docs/00b_LOCAL_DEV_BOOTSTRAP.md` all define the canonical error envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

But the backend currently does not produce that shape. It throws NestJS built-ins (`UnauthorizedException`, `ConflictException`, `NotFoundException`) whose `getResponse()` returns `{ message, error, statusCode }`. Today's frontend `SignInPage` handles this by catching axios errors and showing the generic string `Invalid email or password` — the backend's actual message is lost.

For success, no envelope exists at all: `/auth/signin` returns `{ accessToken, refreshToken }` only. There is no message to surface.

`@mantine/notifications@9.4.2` is already in `frontend/package.json` but not mounted. `useMutation` patterns live in `frontend/src/hooks/auth/useSignIn.ts` and a few sibling files. Axios is configured at `frontend/src/api/client.ts:22-34` and currently redirects to `/auth/signin` on any 401.

M1 (Auth) is complete; M2 (Job Postings + Candidates) is the next planned milestone. This M1.5 work keeps the changeset small and gives every M2+ mutation a one-liner hook to fire toasts.

---

## Design

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser (React + Vite)                       │
│                                                                  │
│   ┌─────────────────┐         ┌───────────────────────────────┐  │
│   │  SignInPage,    │ mutate  │  useApiMutation (NEW)         │  │
│   │  JobCreatePage, │────────▶│  wraps useMutation            │  │
│   │  etc.           │         │  onSuccess → notifications    │  │
│   └─────────────────┘         │  onError  → notifications     │  │
│                               │  (skip on 401)                │  │
│                               └───────────────────────────────┘  │
│                                          │                       │
│                                          ▼                       │
│                               ┌───────────────────────────────┐  │
│                               │ apiClient (response intercept.)│  │
│                               │  • 401 (with token) → logout  │  │
│                               │  • 401 (no token) → reject    │  │
│                               │  • else → reject(axios error) │  │
│                               └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                  NestJS                                           │
│                                                                  │
│   ┌────────────────────────┐                                      │
│   │ Controllers           │                                      │
│   └────────────────────────┘                                      │
│           │                                                      │
│           ▼                                                      │
│   ┌────────────────────────┐  2xx →   { data, message }          │
│   │ ResponseInterceptor   │◀──────── (NEW, wraps success bodies)│
│   │ (NEW, global)         │                                       │
│   └────────────────────────┘                                      │
│           │ throw                                                │
│           ▼                                                      │
│   ┌────────────────────────┐  err →  { error: { code, message } }│
│   │ ApiExceptionFilter    │◀──────── (NEW, normalizes errors)    │
│   │ (NEW, global)         │                                       │
│   └────────────────────────┘                                      │
│                                                                  │
│   Pipes (ValidationPipe etc.) run before these in the request     │
│   pipeline; their thrown errors flow through the filter unchanged │
│   and become { error: { code: 'VALIDATION_ERROR', ... } }.       │
└──────────────────────────────────────────────────────────────────┘
```

### Backend — envelope contract

**Success — `backend/src/shared/response.interceptor.ts`**

Every 2xx response is wrapped as:

```json
{ "data": <controller return value>, "message": "OK" }
```

Default `message` is the literal string `"OK"`. Handlers that want specific copy return an explicit envelope `{ data, message }` themselves; the interceptor detects this by checking that the returned value is a non-null object whose own keys include both `data` and `message` (an `Array`, which lacks `message`, is never detected as an envelope and is therefore wrapped normally), and returns it unchanged. The two relevant handlers in M1.5 — `auth.service.signin` and the `orgSignup` / `candidateSignup` handlers — are updated to return explicit envelopes so their success toasts carry meaningful copy.

**Error — `backend/src/shared/api-exception.filter.ts`**

Every thrown error is normalized to:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid credentials" } }
```

`code` is derived from HTTP status via a fixed table:

| Status | Code |
|--------|------|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 422 | `UNPROCESSABLE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 503 | `SERVICE_UNAVAILABLE` |

Unhandled statuses fall through to `INTERNAL_ERROR`. `message` extraction (in order): `HttpException.getResponse()` as a string when present; otherwise the object's `message` property — joined with `, ` when it is a `string[]` (the shape `ValidationPipe` produces), used as-is when it is a string, otherwise falls back to the exception's own `message` when it is a plain `Error`, otherwise the literal `'Internal server error'`. Non-`HttpException` errors are also logged at `error` level via Nest's `Logger` so the server-side audit trail is not lost.

Both pieces are registered **globally** in `backend/src/main.ts`:

```ts
app.useGlobalInterceptors(new ResponseInterceptor());
app.useGlobalFilters(new ApiExceptionFilter());
```

No controllers, services, or modules are modified. `app.module.ts` is unchanged because global interceptors/filters are not part of DI module graph.

### Frontend — `useApiMutation`

**Mount provider** — `frontend/src/app/providers.tsx`:

```tsx
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
// ...
<MantineProvider>
  <Notifications position="top-right" zIndex={2000} />
  <RouterProvider router={router} />
</MantineProvider>
```

**Hook** — `frontend/src/hooks/useApiMutation.ts`:

```ts
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { isAxiosError } from 'axios';

interface ApiEnvelope<T> {
  data: T;
  message: string;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface UseApiMutationOptions<TData, TVariables, TContext>
  extends Omit<
    UseMutationOptions<ApiEnvelope<TData>, unknown, TVariables, TContext>,
    'mutationFn' | 'onSuccess' | 'onError'
  > {
  mutationFn: (variables: TVariables) => Promise<ApiEnvelope<TData>>;
  /** Override the success toast copy. Default: backend envelope.message. */
  successMessage?: string;
  /** Override the error toast copy. Default: backend error.error.message. */
  errorMessage?: string;
  /** Suppress both toasts. Caller handles feedback. */
  silent?: boolean;
  onSuccess?: UseMutationOptions<ApiEnvelope<TData>, unknown, TVariables, TContext>['onSuccess'];
  onError?: UseMutationOptions<ApiEnvelope<TData>, unknown, TVariables, TContext>['onError'];
}

export function useApiMutation<TData = unknown, TVariables = void, TContext = unknown>(
  options: UseApiMutationOptions<TData, TVariables, TContext>,
) {
  const {
    mutationFn,
    successMessage,
    errorMessage,
    silent,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<ApiEnvelope<TData>, unknown, TVariables, TContext>({
    ...rest,
    mutationFn,
    onSuccess: (data, vars, ctx) => {
      if (!silent) {
        notifications.show({
          color: 'green',
          title: 'Success',
          message: successMessage ?? data.message ?? 'Done',
        });
      }
      onSuccess?.(data, vars, ctx);
    },
    onError: (err, vars, ctx) => {
      const status = isAxiosError<ApiErrorBody>(err) ? err.response?.status : undefined;
      if (status !== 401 && !silent) {
        const backendMessage = isAxiosError<ApiErrorBody>(err)
          ? err.response?.data?.error?.message
          : undefined;
        notifications.show({
          color: 'red',
          title: 'Error',
          message: errorMessage ?? backendMessage ?? 'Something went wrong',
        });
      }
      onError?.(err, vars, ctx);
    },
  });
}
```

The hook inherits everything else from `useMutation` (retry policy, mutation cache keys, etc.) via `...rest`. It does **not** silently re-wrap axios's response — callers' `mutationFn` must already return `ApiEnvelope<T>`. `apiClient.post(...)` does that naturally once the backend ships the envelope (axios keeps its outer `{ data, status, headers, ... }`; `.data` is the envelope).

**Migration of the only existing consumer** — `frontend/src/hooks/auth/useSignIn.ts`:

```ts
import { useApiMutation } from '@/hooks/useApiMutation';
import { authApi } from '@/api/authApi';
import { useAuthStore } from '@/api/useAuth';

export function useSignIn() {
  const { setTokens } = useAuthStore();

  return useApiMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.signin(email, password).then((r) => r.data),
    onSuccess: ({ data }) => {
      setTokens(data.accessToken, data.refreshToken);
    },
  });
}
```

`SignInPage` is **not** touched (its inline `<Alert>` stays); the success path now also shows a toast. UX widens, doesn't change.

**axios 401 guard** — `frontend/src/api/client.ts`:

Today, the response interceptor logs out on *any* 401, including `POST /auth/signin` with bad credentials — this would kick the user out of the signin page mid-login. Tighten it to:

```ts
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { accessToken, logout } = useAuthStore.getState();
      if (accessToken) {
        logout();
        if (typeof window !== 'undefined') window.location.href = '/auth/signin';
      }
    }
    return Promise.reject(error);
  },
);
```

Now a 401 with no token (signin attempt) just rejects, leaving the caller to handle it; a 401 with a token (expired session) still ends the session and redirects.

### Data flow

**Happy path — signin**

1. User submits `SignInPage` form.
2. `useSignIn.mutateAsync` awaits `apiClient.post('/auth/signin', { ... })`.
3. Backend `ResponseInterceptor` wraps → `{ data: { accessToken, refreshToken }, message: 'Signed in' }`; HTTP 200.
4. axios resolves with `response.data` = the envelope.
5. `useApiMutation.onSuccess`:
   - `notifications.show({ color: 'green', title: 'Success', message: 'Signed in' })`
   - Then caller's `onSuccess` writes tokens to the store.
6. Page navigates to the role-specific dashboard.

**Error path — bad credentials**

1. User submits wrong password.
2. `auth.service.signin` throws `UnauthorizedException('Invalid credentials')`.
3. `ApiExceptionFilter` catches; derives `status: 401`, `code: 'UNAUTHORIZED'`, `message: 'Invalid credentials'`. Body: `{ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }`.
4. axios response interceptor sees 401 with `accessToken === null` → no redirect; rejects the promise.
5. `useApiMutation.onError`: status is 401 → suppresses toast. Calls caller's `onError` (none).
6. `SignInPage.handleSubmit`'s `catch` block catches → still sets `error = 'Invalid email or password'` via inline `<Alert>` (unchanged).

**Error path — expired session**

1. User has a valid token, opens `/dashboard`, fires a query.
2. Backend rejects with 401.
3. axios response interceptor sees 401 with `accessToken` set → `logout()` + `window.location = '/auth/signin'`.
4. `useApiMutation.onError` runs after the redirect; it sees 401 → suppresses toast.

### Error handling summary

| Scenario | Toast? | Reason |
|----------|--------|--------|
| Mutation success (2xx with `message`) | Green, with backend message | Default behavior |
| Mutation success (2xx with no message) | Green, "Done" | Fallback copy |
| Mutation error (4xx/5xx with `error.message`) | Red, with backend message | Default behavior |
| Mutation error (network/timeout) | Red, "Something went wrong" | Fallback |
| 401 with token (expired session) | None | axios interceptor redirects; toast would be noise |
| 401 without token (signin failure) | None | Page-level alert handles UX; toast would be redundant |
| Caller sets `silent: true` | None | Opt-out for hand-rolled UX |

---

## Files

### Backend — 2 new, 3 edited

| Path | Change |
|------|--------|
| `backend/src/shared/response.interceptor.ts` | **NEW** — `ResponseInterceptor<T>` |
| `backend/src/shared/api-exception.filter.ts` | **NEW** — `ApiExceptionFilter` with status→code map |
| `backend/src/main.ts` | register both globally |
| `backend/src/modules/auth/auth.service.ts` | update `signin`, `candidateSignup`, `orgSignup` to return explicit envelopes (see "small handler edits" below) |
| `backend/src/modules/auth/auth.controller.ts` | ensure endpoints return new envelopes unchanged (verify during implementation) |

### Backend — small handler edits (signin + signups)

| Path | Change |
|------|--------|
| `backend/src/modules/auth/auth.service.ts` | `signin()` returns `{ data: { accessToken, refreshToken }, message: 'Signed in' }` instead of bare tokens. `candidateSignup()` returns `{ data: { userId }, message: 'Account created' }`. `orgSignup()` returns `{ data: { tenantId, userId }, message: 'Company created' }`. Each is the canonical shape future handlers should mimic to set their own toast copy. |
| `backend/src/modules/auth/auth.controller.ts` | Endpoints return the new envelopes unchanged; no extra wrapping needed. (Only required if the service returns are not already passed through — confirm during implementation.) |

### Frontend — 1 new, 3 edited

| Path | Change |
|------|--------|
| `frontend/src/hooks/useApiMutation.ts` | **NEW** — the wrapper hook |
| `frontend/src/app/providers.tsx` | mount `<Notifications />` + import `@mantine/notifications/styles.css` |
| `frontend/src/api/client.ts` | tighten 401 interceptor (only redirect when token existed) |
| `frontend/src/hooks/auth/useSignIn.ts` | swap `useMutation` → `useApiMutation` (single existing consumer) |

No changes to `api/authApi.ts`, `useAuth.ts`, `SignInPage.tsx`, or any `routes/*` file.

---

## Tests

### Backend (Jest + supertest — already configured)

- `backend/src/shared/api-exception.filter.spec.ts` (NEW): maps `UnauthorizedException('msg')` → `401 + { error: { code: 'UNAUTHORIZED', message: 'msg' } }`; maps plain `Error('msg')` → `500 + { error: { code: 'INTERNAL_ERROR', message: 'msg' } }`; status-to-code table covers all listed codes; `message: string[]` from `ValidationPipe` is joined with `, `.
- `backend/src/shared/response.interceptor.spec.ts` (NEW): wraps `{ data: T }` payloads as `{ data, message: 'OK' }`; passes through pre-wrapped payloads (no double-wrap); preserves null returns.
- `backend/test/app.e2e-spec.ts` (EDIT): assert `POST /api/auth/signin` with valid creds returns `{ data: { accessToken, refreshToken }, message: 'Signed in' }`; with bad creds returns `401 + { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }`.

### Frontend

- No new unit tests in this milestone — no test runner is configured for `frontend/`. We instead verify by hand:
  - Login with valid creds → green toast "Signed in" appears top-right, dashboard navigates.
  - Login with bad creds → no toast, page shows inline alert (axios does not redirect because no token was sent).
  - Log in, leave tab idle until access token is near expiry, refresh — axios redirects to `/auth/signin` with no toast.
- Hook unit tests are deferred to the M9 CI milestone where a frontend test runner will be set up.

### Lint and typecheck

- Backend: `npm run typecheck` and `npm run lint` clean.
- Frontend: `npm run typecheck` and `npm run lint` clean.

---

## Acceptance criteria

1. `POST /api/auth/signin` with valid creds returns `{ data: { accessToken, refreshToken }, message: 'Signed in' }`.
2. Same call with bad creds returns `401` with body `{ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }`.
3. A 401 from any other endpoint while a token is held redirects to `/auth/signin` with no toast.
4. A 401 from any endpoint without a held token (e.g. bad signin) does not redirect; the caller handles the rejection.
5. A successful login shows a green Mantine notification top-right within ~200ms of the response, with text "Signed in". The `SignInPage` still navigates to the role-routed destination.
6. Successful signup (candidate or org) shows a green toast with the backend's `message` ("Account created"). The body text and the toast are the same.
7. Existing health and logout endpoints still respond with their pre-existing behavior on the success path — `ResponseInterceptor` does not strip arrays (which lack `message` and so are treated as payloads, not envelopes) or interfere with `204 No Content` (controllers returning nothing produce `{ data: null, message: 'OK' }`).
8. `npm run typecheck` and `npm run lint` are clean on both packages.

---

## Migration notes for future milestones

- Every new mutation in M2+ should use `useApiMutation` instead of `useMutation`. Toasts then "just work".
- To customize success copy without changing the backend, pass `successMessage: 'Job created'` to the hook.
- Handlers that want specific toast copy should return `{ data, message: 'Foo created' }` from the backend. The `ResponseInterceptor` will not wrap a returned `{ data, message }` envelope.
- The inline `<Alert>` on `SignInPage` and elsewhere will be revisited in a future milestone when consolidating failure UX (M9 admin work or earlier).
