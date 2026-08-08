import { Outlet, Link, useNavigate, useMatchRoute } from '@tanstack/react-router';
import {
  AppShell,
  Burger,
  Group,
  Text,
  NavLink,
  Badge,
  Divider,
  ScrollArea,
  UnstyledButton,
  Avatar,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDashboard,
  IconBriefcase,
  IconUsers,
  IconLayoutKanban,
  IconCalendarEvent,
  IconSettings,
  IconUserPlus,
  IconLogout,
} from '@tabler/icons-react';
import { useAuthStore } from '../../api/useAuth';
import { useLogout } from '../../hooks/auth';
import { ColorSchemeToggle } from '../../components/ColorSchemeToggle';
import { PageTransition } from '../../components/PageTransition';

export function CompanyPlatform() {
  const [opened, { toggle }] = useDisclosure();
  const role = useAuthStore((s) => s.role);
  const { mutateAsync: logout } = useLogout();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/auth/signin' });
  };

  const navItems = [
    { label: 'Dashboard', icon: IconDashboard, to: '/company/dashboard' },
    { label: 'Job Postings', icon: IconBriefcase, to: '/company/job-postings' },
    { label: 'Candidates', icon: IconUsers, to: '/company/candidates' },
    { label: 'Pipeline', icon: IconLayoutKanban, to: '/company/pipeline' },
    { label: 'Interviews', icon: IconCalendarEvent, to: '/company/interviews' },
  ];

  const adminItems =
    role === 'CompanyAdmin'
      ? [
          { label: 'Team', icon: IconUserPlus, to: '/company/users' },
          { label: 'Settings', icon: IconSettings, to: '/company/settings' },
        ]
      : [];

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" c="indigo">
              TalentPipe
            </Text>
            {role && (
              <Badge variant="light" color="indigo" size="sm">
                {role}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            <ColorSchemeToggle />
            <UnstyledButton
              onClick={handleLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8 }}
            >
              <IconLogout size="1rem" stroke={1.5} />
              <Text size="sm" hiddenFrom="sm">Logout</Text>
            </UnstyledButton>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" mb="xs" pl="xs">
            Recruitment
          </Text>
          {navItems.map((item) => {
            const active = !!matchRoute({ to: item.to, fuzzy: false });
            return (
              <NavLink
                key={item.to}
                label={item.label}
                leftSection={<item.icon size="1.1rem" stroke={1.5} />}
                component={Link}
                to={item.to}
                active={active}
                variant={active ? 'light' : 'subtle'}
                mb={2}
              />
            );
          })}

          {adminItems.length > 0 && (
            <>
              <Divider my="sm" />
              <Text size="xs" fw={500} c="dimmed" tt="uppercase" mb="xs" pl="xs">
                Administration
              </Text>
              {adminItems.map((item) => {
                const active = !!matchRoute({ to: item.to, fuzzy: false });
                return (
                  <NavLink
                    key={item.to}
                    label={item.label}
                    leftSection={<item.icon size="1.1rem" stroke={1.5} />}
                    component={Link}
                    to={item.to}
                    active={active}
                    variant={active ? 'light' : 'subtle'}
                    mb={2}
                  />
                );
              })}
            </>
          )}
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="sm" />
          <Group gap="sm">
            <Avatar color="indigo" size="sm" radius="xl">
              {role?.charAt(0).toUpperCase() ?? 'U'}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {role ?? 'User'}
              </Text>
            </div>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </AppShell.Main>
    </AppShell>
  );
}
