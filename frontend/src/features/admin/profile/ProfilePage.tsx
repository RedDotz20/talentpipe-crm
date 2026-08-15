import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DetailSkeleton } from '@/shared/components/Skeletons';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { IconUpload } from '@tabler/icons-react';
import {
  usePlatformProfile,
  useRemovePlatformAvatar,
  useUpdatePlatformProfile,
  useUploadPlatformAvatar,
} from './hooks/usePlatformProfile';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

export function AdminProfilePage() {
  const { data: profile, isLoading, error } = usePlatformProfile();
  const updateProfile = useUpdatePlatformProfile();
  const uploadAvatar = useUploadPlatformAvatar();
  const removeAvatar = useRemovePlatformAvatar();
  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setName(profile.name ?? '');
  }, [profile]);

  if (isLoading) return <DetailSkeleton lines={4} />;
  if (error) return <Alert color="red">Failed to load profile: {error.message}</Alert>;
  if (!profile) return <Text>No profile data available</Text>;

  const handleAvatarFileChange = (file: File | null) => {
    setAvatarFile(file);
    setAvatarError(null);
    if (!file) return;
    if (!AVATAR_ACCEPT.includes(file.type)) {
      setAvatarError('Only PNG, JPEG and WebP images are allowed.');
      setAvatarFile(null);
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError('Avatar must be 5MB or smaller.');
      setAvatarFile(null);
    }
  };

  return (
    <Stack maw={560}>
      <Group justify="space-between">
        <Title order={2}>Profile</Title>
        <Badge variant="light" color="indigo">SuperAdmin</Badge>
      </Group>

      <Stack gap="xs" mb="md">
        <Text fw={500}>Profile picture</Text>
        <Group align="center" gap="lg">
          <UserAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="xl" />
          <Stack gap="xs">
            <Group gap="xs">
              <FileButton onChange={handleAvatarFileChange} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <Button {...props} variant="light" leftSection={<IconUpload size="1rem" />}>
                    Choose image
                  </Button>
                )}
              </FileButton>
              {profile.avatarUrl && (
                <Button variant="subtle" color="red" loading={removeAvatar.isPending} onClick={() => removeAvatar.mutate()}>
                  Remove
                </Button>
              )}
            </Group>
            {avatarFile && (
              <Button
                size="xs"
                loading={uploadAvatar.isPending}
                onClick={async () => {
                  await uploadAvatar.mutateAsync(avatarFile);
                  setAvatarFile(null);
                }}
              >
                Upload
              </Button>
            )}
            {avatarError && <Text size="xs" c="red">{avatarError}</Text>}
            {uploadAvatar.error && (
              <Text size="xs" c="red">Upload failed: {(uploadAvatar.error as Error).message}</Text>
            )}
          </Stack>
        </Group>
      </Stack>

      <TextInput
        label="Name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        placeholder="Your display name"
      />
      <TextInput label="Email" value={profile.email} readOnly />
      <Button
        maw={160}
        onClick={() => updateProfile.mutate(name)}
        loading={updateProfile.isPending}
        disabled={name.trim().length === 0}
      >
        Save changes
      </Button>
    </Stack>
  );
}
