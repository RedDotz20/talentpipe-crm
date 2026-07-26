import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDashboard, IconBriefcase, IconUsers, IconLayoutKanban, IconCalendarEvent } from '@tabler/icons-react';
import { useAuthStore } from '../shared/api/useAuth';

export function OrgPlatform() {
  const [opened] = useDisclosure();
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  const navItems = [
    { label: 'Dashboard', icon: IconDashboard, to: '/dashboard' },
    { label: 'Job Postings', icon: IconBriefcase, to: '/job-postings' },
    { label: 'Candidates', icon: IconUsers, to: '/candidates' },
    { label: 'Pipeline', icon: IconLayoutKanban, to: '/pipeline' },
    { label: 'Interviews', icon: IconCalendarEvent, to: '/interviews' },
  ];

  return (
    <MantineShell
      header={{ height: 60 }}
      navbar={isAuth ? { width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } } : undefined}
      padding="md"
    >
      <MantineShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>TalentPipe</Text>
          {isAuth && (
            <Group>
              <Text size="sm" c="dimmed">{role}</Text>
              <Button variant="outline" size="xs" onClick={handleLogout}>Logout</Button>
            </Group>
          )}
        </Group>
      </MantineShell.Header>

      {isAuth && (
        <MantineShell.Navbar p="xs">
          {navItems.map((item) => (
            <NavLink key={item.to} label={item.label} leftSection={<item.icon size="1rem" />} component={Link} to={item.to} />
          ))}
        </MantineShell.Navbar>
      )}

      <MantineShell.Main>
        <Outlet />
      </MantineShell.Main>
    </MantineShell>
  );
}
