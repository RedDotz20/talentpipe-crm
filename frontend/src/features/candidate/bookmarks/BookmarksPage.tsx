import { useNavigate } from '@tanstack/react-router';
import { Card, Text, Title, Badge, Button, Group, Stack, Loader, Alert } from '@mantine/core';
import { useAuthStore } from '../../../shared/api/useAuth';
import { useBookmarks, useRemoveBookmark } from '../../../shared/hooks';
import type { Bookmark } from '../../../shared/hooks/useBookmarks';

export function BookmarksPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const { data: bookmarks = [], isLoading: bookmarksLoading, error: bookmarksError } = useBookmarks();
  const { mutate: removeBookmark, isPending: isRemoving } = useRemoveBookmark();

  if (!isAuthenticated) {
    navigate({ to: '/auth/signin' });
    return null;
  }

  if (bookmarksLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (bookmarksError) {
    return <Alert color="red">Failed to load bookmarks: {bookmarksError.message}</Alert>;
  }

  if (bookmarks.length === 0) {
    return <Text>No bookmarks yet</Text>;
  }

  return (
    <Stack>
      <Title order={2}>My Bookmarks</Title>
      {bookmarks.map((bookmark: Bookmark) => (
        <Card key={bookmark.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <div>
              <Title order={4}>{bookmark.title}</Title>
              <Text size="sm" c="dimmed">{bookmark.companyName}</Text>
            </div>
            <Badge>{bookmark.employmentType}</Badge>
          </Group>
          <Text size="sm" mb="md">{bookmark.location}</Text>
          <Button
            color="red"
            variant="outline"
            onClick={() => removeBookmark(bookmark.jobListingId)}
            loading={isRemoving}
          >
            Remove Bookmark
          </Button>
        </Card>
      ))}
    </Stack>
  );
}