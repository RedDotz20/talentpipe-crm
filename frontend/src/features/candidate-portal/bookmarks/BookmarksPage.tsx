import { Card, Text, Title, Button, Group, Stack, Loader, Alert } from '@mantine/core';
import { useBookmarks, useRemoveBookmark } from '../hooks';
import type { Bookmark } from '../types';

export function BookmarksPage() {
  const { data: bookmarks = [], isLoading: bookmarksLoading, error: bookmarksError } = useBookmarks();
  const { mutate: removeBookmark, isPending: isRemoving } = useRemoveBookmark();

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
          <Group justify="space-between">
            <div>
              <Title order={4}>{bookmark.jobTitle}</Title>
              <Text size="sm" c="dimmed">{bookmark.companyName}</Text>
            </div>
            <Button
              color="red"
              variant="outline"
              onClick={() => removeBookmark(bookmark.id)}
              loading={isRemoving}
            >
              Remove Bookmark
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
