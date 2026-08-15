import { Outlet, Link, useMatchRoute } from '@tanstack/react-router';
import {
  AppShell,
  Burger,
  Group,
  Text,
  NavLink,
  Divider,
  ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingEstate,
  IconUsers,
  IconListDetails,
  IconBriefcase,
  IconLayoutDashboard,
  IconShieldLock,
} from '@tabler/icons-react';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { PageTransition } from '@/components/PageTransition';
import { useAuthStore } from '@/api/useAuth';
import { useMe } from '@/hooks/useMe';
import { UserMenu } from '@/shared/components/UserMenu';
import { UserAvatar } from '@/shared/components/UserAvatar';

export function SuperAdminPlatform() {
  const [opened, { toggle }] = useDisclosure();
  const profile = useAuthStore((s) => s.profile);
  useMe();
  const matchRoute = useMatchRoute();

  const navItems = [
    { label: 'Dashboard', icon: IconLayoutDashboard, to: '/admin/dashboard' },
    { label: 'Companies', icon: IconBuildingEstate, to: '/admin/companies' },
    { label: 'Jobs List', icon: IconBriefcase, to: '/admin/jobs' },
    { label: 'User Management', icon: IconUsers, to: '/admin/users' },
    { label: 'Candidate Applications', icon: IconListDetails, to: '/admin/applications' },
    { label: 'Permissions', icon: IconShieldLock, to: '/admin/permissions' },
  ];

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
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              Platform Admin
            </Text>
          </Group>
          <Group gap="xs">
            <ColorSchemeToggle />
            <UserMenu profilePath="/admin/profile" roleLabel="SuperAdmin" />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" mb="xs" pl="xs">
            Platform
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
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="sm" />
          <Group gap="sm">
            <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} color="red" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {profile?.name ?? 'SuperAdmin'}
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
