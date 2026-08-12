import { Link, useLocation } from '@tanstack/react-router';
import { Button, Container, Text, Title } from '@mantine/core';

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <Container
      size="sm"
      ta="center"
      h="100vh"
      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
    >
      <Title size={96} c="dimmed">404</Title>
      <Title order={2} mb="sm">Page not found</Title>
      <Text c="dimmed" mb="lg">
        The page <Text span c="white" ff="monospace">{pathname}</Text> does not exist or has been moved.
      </Text>
      <div>
        <Button component={Link} to="/">Back to home</Button>
      </div>
    </Container>
  );
}
