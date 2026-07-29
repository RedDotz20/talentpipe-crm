import { Title, TextInput, Stack, Loader, Group, Text, Alert } from '@mantine/core';
import { useProfile } from '../../../shared/hooks/candidate';

export function SettingsPage() {
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Alert color="red">Failed to load profile: {error.message}</Alert>;
  }

  if (!profile) {
    return <Text>No profile data available</Text>;
  }

  const memberSince = new Date(profile.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Stack maw={480}>
      <Title order={2}>Profile Settings</Title>
      <Text size="sm" c="dimmed" mb="md">Member since {memberSince}</Text>
      <TextInput label="First Name" readOnly value={profile.firstName} />
      <TextInput label="Last Name" readOnly value={profile.lastName} />
      <TextInput label="Email" readOnly value={profile.email} />
      <TextInput label="Phone" readOnly value={profile.phone} />
      <TextInput label="Resume URL" readOnly value={profile.resumeUrl} />
    </Stack>
  );
}