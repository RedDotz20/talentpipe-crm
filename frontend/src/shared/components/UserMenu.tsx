import { Menu, UnstyledButton } from '@mantine/core';
import { IconLogout, IconUser } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/api/useAuth';
import { useLogout } from '@/hooks/auth';
import { UserAvatar } from './UserAvatar';

export type ProfilePath = '/settings' | '/company/profile' | '/admin/profile';

export function UserMenu({ profilePath, roleLabel }: { profilePath: ProfilePath; roleLabel: string }) {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const { mutateAsync: logout } = useLogout();

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/auth/signin' });
  };

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <UnstyledButton style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserAvatar name={profile?.name} avatarUrl={profile?.avatarUrl} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{roleLabel}</Menu.Label>
        <Menu.Item leftSection={<IconUser size="0.9rem" />} onClick={() => navigate({ to: profilePath })}>
          Profile
        </Menu.Item>
        <Menu.Item leftSection={<IconLogout size="0.9rem" />} color="red" onClick={handleLogout}>
          Logout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
