import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { NotFoundPage } from '@/components/NotFoundPage';

export const Route = createRootRoute({
  notFoundComponent: NotFoundPage,
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
