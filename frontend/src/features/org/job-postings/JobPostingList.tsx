import { Badge, Button, Group, Loader, Stack, Table, Title } from '@mantine/core';
import { useAuthStore } from '../../../api/useAuth';
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
  const { data, isLoading } = useJobPostings();
  const publish = usePublishJobPosting();
  const close = useCloseJobPosting();
  const remove = useDeleteJobPosting();

  const canEdit = role === 'OrgAdmin' || role === 'Recruiter';

  const rows = (data ?? []).map((jp) => (
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
          {role === 'OrgAdmin' && jp.status !== 'open' && (
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
      {isLoading ? (
        <Loader />
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
    </Stack>
  );
}
