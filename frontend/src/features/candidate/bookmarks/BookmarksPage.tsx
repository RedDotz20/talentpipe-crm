import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, Text, Title, Badge, Button, Group, Stack, Loader } from '@mantine/core';
import { useAuthStore } from '../../../shared/api/useAuth';

interface Bookmark {
  id: string;
  jobListingId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
}

export function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

  const getAuthHeaders = (): Record<string, string> => {
    const token = useAuthStore.getState().accessToken;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      navigate({ to: '/candidate/login' });
      return;
    }

    setLoading(true);
    fetch(`${apiBase}/candidate/bookmarks`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch bookmarks');
        return res.json();
      })
      .then((data) => {
        setBookmarks(Array.isArray(data) ? data : data.bookmarks ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load bookmarks');
        setLoading(false);
      });
  }, []);

  const handleRemove = async (jobListingId: string) => {
    try {
      const res = await fetch(`${apiBase}/candidate/bookmarks/${jobListingId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove bookmark');
      setBookmarks((prev) => prev.filter((b) => b.jobListingId !== jobListingId));
    } catch {
      setError('Failed to remove bookmark');
    }
  };

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

  if (bookmarks.length === 0) {
    return <Text>No bookmarks yet</Text>;
  }

  return (
    <Stack>
      <Title order={2}>My Bookmarks</Title>
      {bookmarks.map((bookmark) => (
        <Card key={bookmark.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <div>
              <Title order={4}>{bookmark.title}</Title>
              <Text size="sm" c="dimmed">{bookmark.companyName}</Text>
            </div>
            <Badge>{bookmark.employmentType}</Badge>
          </Group>
          <Text size="sm" mb="md">{bookmark.location}</Text>
          <Button color="red" variant="outline" onClick={() => handleRemove(bookmark.jobListingId)}>
            Remove Bookmark
          </Button>
        </Card>
      ))}
    </Stack>
  );
}
