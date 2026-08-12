import { useState } from 'react';
import { Badge, Button, Group, Pagination, Stack, Table, Title } from '@mantine/core';
import { useAuthStore } from '../../../api/useAuth';
import { ListControls } from '@/shared/components/ListControls';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { useListQuery } from '@/shared/hooks/useListQuery';
import {
  useJobPostings,
  usePublishJobPosting,
  useCloseJobPosting,
  useDeleteJobPosting,
} from './hooks/useJobPostings';

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray',
  open: 'green',
  closed: 'red',
};

export function JobPostingList({ onCreate }: { onCreate: () => void }) {
  const role = useAuthStore((s) => s.role);
  const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { data: result = { data: [], total: 0 }, isLoading } = useJobPostings({
    ...listQuery.params,
    status: statusFilter ?? undefined,
  });
  const data = result.data;
  const publish = usePublishJobPosting();
  const close = useCloseJobPosting();
  const remove = useDeleteJobPosting();

  const canEdit = role === 'CompanyAdmin' || role === 'Recruiter';

  const rows = data.map((jp) => (
    <Table.Tr key={jp.id}>
      <Table.Td>{jp.title}</Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLOR[jp.status] ?? 'gray'}>{jp.status}</Badge>
      </Table.Td>
      <Table.Td>{new Date(jp.createdAt).toLocaleDateString()}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          {canEdit && jp.status === 'draft' && (
            <Button size="xs" onClick={() => publish.mutate(jp.id)}>
              Publish
            </Button>
          )}
          {canEdit && jp.status === 'open' && (
            <Button size="xs" variant="outline" onClick={() => close.mutate(jp.id)}>
              Close
            </Button>
          )}
          {role === 'CompanyAdmin' && jp.status !== 'open' && (
            <Button size="xs" color="red" variant="light" onClick={() => remove.mutate(jp.id)}>
              Delete
            </Button>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Job Postings</Title>
        {canEdit && <Button onClick={onCreate}>New Posting</Button>}
      </Group>
      <ListControls
        searchPlaceholder="Search title"
        searchValue={listQuery.search}
        onSearchChange={(value) => {
          listQuery.setSearch(value);
          listQuery.setPage(1);
        }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            data: [
              { value: 'draft', label: 'Draft' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ],
            value: statusFilter,
            onChange: (value) => {
              setStatusFilter(value);
              listQuery.setPage(1);
            },
          },
        ]}
        sortOptions={[
          { value: 'createdAt', label: 'Date created' },
          { value: 'title', label: 'Title' },
        ]}
        sortBy={listQuery.sortBy}
        onSortByChange={(value) => {
          listQuery.setSortBy(value);
          listQuery.setPage(1);
        }}
        sortDir={listQuery.sortDir}
        onToggleSortDir={listQuery.toggleSortDir}
      />
      {isLoading ? (
        <TableSkeleton headers={['Title', 'Status', 'Created', 'Actions']} />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Title</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      )}
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
