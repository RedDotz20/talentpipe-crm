import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Container, Title, Text, Button } from '@mantine/core';

export const Route = createRootRoute({
  notFoundComponent: () => (
    <Container ta="center" py="xl">
      <Title>404</Title>
      <Text c="dimmed" mb="lg">Page not found</Text>
      <Button component={Link} to="/auth/signin">Go home</Button>
    </Container>
  ),
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
