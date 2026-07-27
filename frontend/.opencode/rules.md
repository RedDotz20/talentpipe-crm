# Frontend Focus

You are working on the **TalentPipe frontend** only. Follow these constraints:

## Stack Constraints

- **React 19** — use `use()` for promises, `useActionState` for forms, `useOptimistic` for optimistic updates. No class components.
- **Mantine 9** — all UI comes from Mantine v9 components (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`, `@mantine/dates`, `@mantine/form`). Use Mantine's CSS-in-JS approach — no Tailwind, no styled-components.
- **TanStack Router 1** — file-based routing with `@tanstack/router-plugin`. Route files live in `src/routes/` (flat convention: dots for path nesting, `_` prefix for pathless layouts). Each file exports `Route` from `createFileRoute('/path')` or `createRootRoute()`. The generated `src/routeTree.gen.ts` is auto-created by the Vite plugin. Use `@tanstack/react-router`.
- **TanStack Query 5** — all server state. Use `useSuspenseQuery` / `useSuspenseInfiniteQuery` / `useMutation`. No plain `useEffect` data fetching.
- **Zustand 5** — client state only (auth, UI preferences). Use the `create` store pattern.
- **dnd-kit** — all drag-and-drop (pipeline Kanban).
- **Zod 4** — shared validation schemas with backend.
- **oxlint** — run `npm run lint` (oxlint, NOT eslint). Never disable lint rules.

## Validation

- Run `cd frontend && npm run lint` before claiming work is complete.
- Run `cd frontend && npm run build` to typecheck + build.
- All components must be typed with TypeScript — no `any` or `as unknown`.

## Architecture

- Feature directories under `src/features/<name>/` — each contains its own components, hooks, and API calls.
- Shared code goes in `src/shared/` (components/, hooks/, api/, types/, utils/).
- API calls go in `src/shared/api/` — use Zustand stores for auth state, TanStack Query for data fetching.
- Routes are defined in `src/routes/` files, imported via the generated `src/routeTree.gen.ts` into `src/app/router.tsx`.
