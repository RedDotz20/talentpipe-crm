import {
  AppShell,
  Group,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { Outlet, useMatchRoute, Link } from '@tanstack/react-router';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { PageTransition } from '@/components/PageTransition';
import { IconBookmark, IconBriefcase, IconFileText } from '@tabler/icons-react';
import { useMe } from '@/hooks/useMe';
import { UserMenu } from '@/shared/components/UserMenu';

export function CandidatePlatform() {
  useMe();
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
            <UserMenu profilePath="/settings" roleLabel="Candidate" />
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
