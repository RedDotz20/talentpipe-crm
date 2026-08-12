import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FileInput,
  Group,
  MultiSelect,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DetailSkeleton } from '@/shared/components/Skeletons';
import {
  useAllSkills,
  useProfile,
  useRemoveResume,
  useSetCandidateSkills,
  useUpdateProfile,
  useUploadResume,
} from '../hooks';

export function SettingsPage() {
  const { data: profile, isLoading, error } = useProfile();
  const { data: allSkills = [] } = useAllSkills();
  const updateProfile = useUpdateProfile();
  const setSkills = useSetCandidateSkills();
  const uploadResume = useUploadResume();
  const removeResume = useRemoveResume();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setEmail(profile.email);
    setPhone(profile.phone ?? '');
    setSkillIds(profile.skills.map((skill) => skill.id));
  }, [profile]);

  if (isLoading) {
    return <DetailSkeleton lines={6} />;
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

  const handleSave = async () => {
    await updateProfile.mutateAsync({ firstName, lastName, email, phone: phone || undefined });
    await setSkills.mutateAsync(skillIds);
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) return;
    await uploadResume.mutateAsync(resumeFile);
    setResumeFile(null);
  };

  return (
    <Stack maw={560}>
      <Title order={2}>Profile Settings</Title>
      <Text size="sm" c="dimmed" mb="md">Member since {memberSince}</Text>
      <TextInput label="First Name" value={firstName} onChange={(event) => setFirstName(event.currentTarget.value)} required />
      <TextInput label="Last Name" value={lastName} onChange={(event) => setLastName(event.currentTarget.value)} required />
      <TextInput label="Email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} required />
      <TextInput label="Phone" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} />
      <MultiSelect
        label="Skills"
        data={allSkills.map((skill) => ({ value: skill.id, label: skill.name }))}
        value={skillIds}
        onChange={setSkillIds}
        searchable
        clearable
      />
      <Stack gap="xs">
        <Text fw={500}>Resume</Text>
        {profile.resumeFileUrl ? (
          <Text size="sm">
            Current resume uploaded {profile.resumeUploadedAt ? new Date(profile.resumeUploadedAt).toLocaleDateString() : ''}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">No resume uploaded</Text>
        )}
        <Group align="end">
          <FileInput
            flex={1}
            value={resumeFile}
            onChange={setResumeFile}
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            placeholder="Choose PDF or DOCX"
            clearable
          />
          <Button onClick={handleResumeUpload} loading={uploadResume.isPending} disabled={!resumeFile}>Upload</Button>
          {profile.resumeFileUrl && (
            <Button variant="subtle" color="red" onClick={() => removeResume.mutate()} loading={removeResume.isPending}>
              Remove
            </Button>
          )}
        </Group>
      </Stack>
      <Button onClick={handleSave} loading={updateProfile.isPending || setSkills.isPending}>Save changes</Button>
    </Stack>
  );
}
