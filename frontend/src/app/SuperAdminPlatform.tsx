import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { AppShell as MantineShell, Group, Text, Button, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBuildingEstate } from '@tabler/icons-react';
import { useAuthStore } from '../shared/api/useAuth';

export function SuperAdminPlatform() {
  const [opened] = useDisclosure();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/auth/signin' });
  };

  return (
    <MantineShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={700}>TalentPipe</Text>
          <Button variant="outline" size="xs" onClick={handleLogout}>Logout</Button>
        </Group>
      </MantineShell.Header>

      <MantineShell.Navbar p="xs">
        <NavLink
          label="Tenants"
          leftSection={<IconBuildingEstate size="1rem" />}
          component={Link}
          to="/admin/tenants"
        />
      </MantineShell.Navbar>

      <MantineShell.Main>
        <Outlet />
      </MantineShell.Main>
    </MantineShell>
  );
}
