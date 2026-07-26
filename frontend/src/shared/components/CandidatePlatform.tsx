import { Container, Group, Title, Anchor, Button } from '@mantine/core';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../api/useAuth';

export function CandidatePlatform() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  if (role !== 'Candidate') {
    return null; // will be handled by route guards
  }

  return (
    <>
      <Group p="md" style={{ borderBottom: '1px solid #eee' }}>
        <Title order={3}>TalentPipe</Title>
        <Anchor onClick={() => navigate({ to: '/candidate/dashboard' })}>Jobs</Anchor>
        <Anchor onClick={() => navigate({ to: '/candidate/applications' })}>Applications</Anchor>
        <Anchor onClick={() => navigate({ to: '/candidate/bookmarks' })}>Bookmarks</Anchor>
        <Anchor onClick={() => navigate({ to: '/candidate/settings' })}>Settings</Anchor>
        <Button variant="subtle" onClick={() => { logout(); navigate({ to: '/candidate/login' }); }}>Logout</Button>
      </Group>
      <Container size="lg" py="xl">
        <Outlet />
      </Container>
    </>
  );
}
