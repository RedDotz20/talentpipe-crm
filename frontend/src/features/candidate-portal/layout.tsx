import {
  AppShell,
  Group,
  Text,
  UnstyledButton,
  Avatar,
  Menu,
} from '@mantine/core';
import { Outlet, useNavigate, useMatchRoute, Link } from '@tanstack/react-router';
import { useLogout } from '@/hooks/auth';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { PageTransition } from '@/components/PageTransition';
import { IconLogout, IconUser, IconBookmark, IconBriefcase, IconFileText } from '@tabler/icons-react';

export function CandidatePlatform() {
  const navigate = useNavigate();
  const { mutateAsync: logout } = useLogout();
  const matchRoute = useMatchRoute();

  const navLinks = [
    { label: 'Jobs', to: '/dashboard', icon: IconBriefcase },
    { label: 'Applications', to: '/applications', icon: IconFileText },
    { label: 'Bookmarks', to: '/bookmarks', icon: IconBookmark },
  ];

  return (
    <AppShell header={{ height: 56 }}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xl">
            <Text
              fw={700}
              size="lg"
              c="indigo"
              component={Link}
              to="/dashboard"
              style={{ textDecoration: 'none' }}
            >
              TalentPipe
            </Text>
            <Group gap={0} visibleFrom="sm">
              {navLinks.map((link) => {
                const active = !!matchRoute({ to: link.to, fuzzy: false });
                return (
                  <UnstyledButton
                    key={link.to}
                    component={Link}
                    to={link.to}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: active ? 600 : 400,
                      color: active ? 'var(--mantine-color-indigo-text)' : undefined,
                      backgroundColor: active ? 'var(--mantine-color-indigo-light)' : undefined,
                      transition: 'background-color 120ms ease, color 120ms ease',
                    }}
                  >
                    {link.label}
                  </UnstyledButton>
                );
              })}
            </Group>
          </Group>

          <Group gap="xs">
            <ColorSchemeToggle />
            <Menu shadow="md" width={200} position="bottom-end">
              <Menu.Target>
                <UnstyledButton style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar color="indigo" size="sm" radius="xl">
                    C
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Candidate</Menu.Label>
                <Menu.Item
                  leftSection={<IconUser size="0.9rem" />}
                  onClick={() => navigate({ to: '/settings' })}
                >
                  Settings
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconLogout size="0.9rem" />}
                  color="red"
                  onClick={async () => {
                    await logout();
                    navigate({ to: '/auth/signin' });
                  }}
                >
                  Logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

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
