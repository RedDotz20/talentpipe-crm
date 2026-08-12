import { Card, Text, Title, Button, Group, Stack, Alert, Pagination } from '@mantine/core';
import { ListControls } from '@/shared/components/ListControls';
import { CardGridSkeleton } from '@/shared/components/Skeletons';
import { useListQuery } from '@/shared/hooks/useListQuery';
import { useBookmarks, useRemoveBookmark } from '../hooks';
import type { Bookmark } from '../types';

export function BookmarksPage() {
  const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
  const { data: result = { data: [], total: 0 }, isLoading: bookmarksLoading, error: bookmarksError } = useBookmarks(listQuery.params);
  const bookmarks = result.data;
  const { mutate: removeBookmark, isPending: isRemoving } = useRemoveBookmark();

  if (bookmarksLoading) {
    return (
      <Stack>
        <Title order={2}>My Bookmarks</Title>
        <CardGridSkeleton count={3} cols={{ base: 1, sm: 1, xl: 1 }} />
      </Stack>
    );
  }

  if (bookmarksError) {
    return <Alert color="red">Failed to load bookmarks: {bookmarksError.message}</Alert>;
  }

  if (bookmarks.length === 0) {
    return (
      <Stack>
        <Title order={2}>My Bookmarks</Title>
        <Text>No bookmarks match your filters.</Text>
      </Stack>
    );
  }

  return (
    <Stack>
      <Title order={2}>My Bookmarks</Title>
      <ListControls
        searchPlaceholder="Search job title or company"
        searchValue={listQuery.search}
        onSearchChange={(value) => {
          listQuery.setSearch(value);
          listQuery.setPage(1);
        }}
        sortOptions={[
          { value: 'createdAt', label: 'Date bookmarked' },
          { value: 'jobTitle', label: 'Job title' },
          { value: 'companyName', label: 'Company' },
        ]}
        sortBy={listQuery.sortBy}
        onSortByChange={(value) => {
          listQuery.setSortBy(value);
          listQuery.setPage(1);
        }}
        sortDir={listQuery.sortDir}
        onToggleSortDir={listQuery.toggleSortDir}
      />
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
      <Group justify="center" mt="md">
        <Pagination
          total={Math.max(1, Math.ceil(result.total / 10))}
          value={listQuery.page}
          onChange={listQuery.setPage}
          size="sm"
        />
      </Group>
    </Stack>
  );
}
