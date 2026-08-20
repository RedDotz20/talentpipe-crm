import { Outlet, Link, useMatchRoute } from '@tanstack/react-router';
import {
  AppShell,
  Burger,
  Group,
  Text,
  NavLink,
  Badge,
  Divider,
  ScrollArea,
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
  IconShieldLock,
} from '@tabler/icons-react';
import { useAuthStore } from '@/api/useAuth';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { PageTransition } from '@/components/PageTransition';
import { useMe } from '@/hooks/useMe';
import { UserMenu } from '@/shared/components/UserMenu';
import { UserAvatar } from '@/shared/components/UserAvatar';

export function CompanyPlatform() {
  const [opened, { toggle }] = useDisclosure();
  const role = useAuthStore((s) => s.role);
  const profile = useAuthStore((s) => s.profile);
  useMe();
  const matchRoute = useMatchRoute();

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
          { label: 'Permissions', icon: IconShieldLock, to: '/company/permissions' },
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
            <UserMenu profilePath="/company/profile" roleLabel={role ?? 'User'} />
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
            <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {profile?.name ?? role ?? 'User'}
              </Text>
            </div>
          </Group>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <PageTransition>
          <div style={{ maxWidth: '88rem', marginInline: 'auto' }}>
            <Outlet />
          </div>
        </PageTransition>
      </AppShell.Main>
    </AppShell>
  );
}
