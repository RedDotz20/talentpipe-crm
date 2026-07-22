import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

const queryClient = new QueryClient();

export function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>
  );
}
