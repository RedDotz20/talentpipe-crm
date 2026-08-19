import { Avatar } from '@mantine/core';
import { useAvatarBlob } from '@/shared/hooks/useAvatarBlob';

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 'sm',
  color = 'indigo',
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: string;
  color?: string;
}) {
  const src = useAvatarBlob(avatarUrl);
  return (
    <Avatar src={src ?? undefined} color={color} size={size} radius="xl">
      {initialsOf(name)}
    </Avatar>
  );
}
