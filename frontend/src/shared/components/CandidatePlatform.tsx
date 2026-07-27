import { Container, Group, Title, Anchor, Button } from '@mantine/core';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../api/useAuth';

export function CandidatePlatform() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  if (role !== 'Candidate') {
    return null;
  }

  return (
    <>
      <Group p="md" style={{ borderBottom: '1px solid #eee' }}>
        <Title order={3}>TalentPipe</Title>
        <Anchor onClick={() => navigate({ to: '/dashboard' })}>Jobs</Anchor>
        <Anchor onClick={() => navigate({ to: '/applications' })}>Applications</Anchor>
        <Anchor onClick={() => navigate({ to: '/bookmarks' })}>Bookmarks</Anchor>
        <Anchor onClick={() => navigate({ to: '/settings' })}>Settings</Anchor>
        <Button variant="subtle" onClick={async () => { await logout(); navigate({ to: '/auth/signin' }); }}>Logout</Button>
      </Group>
      <Container size="lg" py="xl">
        <Outlet />
      </Container>
    </>
  );
}
