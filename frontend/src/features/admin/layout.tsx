import { Outlet, Link, useNavigate, useMatchRoute } from '@tanstack/react-router';
import {
  AppShell,
  Burger,
  Group,
  Text,
  NavLink,
  Divider,
  ScrollArea,
  UnstyledButton,
  Avatar,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingEstate,
  IconUsers,
  IconListDetails,
  IconBriefcase,
  IconLogout,
} from '@tabler/icons-react';
import { useLogout } from '@/hooks/auth';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { PageTransition } from '@/components/PageTransition';

export function SuperAdminPlatform() {
  const [opened, { toggle }] = useDisclosure();
  const { mutateAsync: logout } = useLogout();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/auth/signin' });
  };

  const navItems = [
    { label: 'Tenants', icon: IconBuildingEstate, to: '/admin/companies' },
    { label: 'Jobs', icon: IconBriefcase, to: '/admin/jobs' },
    { label: 'Users', icon: IconUsers, to: '/admin/users' },
    { label: 'Applications', icon: IconListDetails, to: '/admin/applications' },
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
            <Avatar color="red" size="sm" radius="xl">
              S
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                SuperAdmin
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
