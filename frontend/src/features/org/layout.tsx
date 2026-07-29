import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDashboard, IconBriefcase, IconUsers, IconLayoutKanban, IconCalendarEvent } from '@tabler/icons-react';
import { useAuthStore } from '../../api/useAuth';
import { useLogout } from '../../hooks/auth';

export function OrgPlatform() {
  const [opened] = useDisclosure();
  const role = useAuthStore((s) => s.role);
  const { mutateAsync: logout } = useLogout();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/auth/signin' });
  };

  const navItems = [
    { label: 'Dashboard', icon: IconDashboard, to: '/org/dashboard' },
    { label: 'Job Postings', icon: IconBriefcase, to: '/org/job-postings' },
    { label: 'Candidates', icon: IconUsers, to: '/org/candidates' },
    { label: 'Pipeline', icon: IconLayoutKanban, to: '/org/pipeline' },
    { label: 'Interviews', icon: IconCalendarEvent, to: '/org/interviews' },
  ];

  return (
    <MantineShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>TalentPipe</Text>
          <Group>
            <Text size="sm" c="dimmed">{role}</Text>
            <Button variant="outline" size="xs" onClick={handleLogout}>Logout</Button>
          </Group>
        </Group>
      </MantineShell.Header>

      <MantineShell.Navbar p="xs">
        {navItems.map((item) => (
          <NavLink key={item.to} label={item.label} leftSection={<item.icon size="1rem" />} component={Link} to={item.to} />
        ))}
      </MantineShell.Navbar>

      <MantineShell.Main>
        <Outlet />
      </MantineShell.Main>
    </MantineShell>
  );
}
