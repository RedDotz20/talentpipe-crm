import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Title, TextInput, Stack, Loader, Group, Text } from '@mantine/core';
import { useAuthStore } from '../../../shared/api/useAuth';

interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  resumeUrl: string;
  createdAt: string;
}

export function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

  const getAuthHeaders = () => {
    const token = useAuthStore.getState().accessToken;
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  };

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      navigate({ to: '/candidate/login' });
      return;
    }

    setLoading(true);
    fetch(`${apiBase}/candidate/profile`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch profile');
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load profile');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Text c="red">{error}</Text>;
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
