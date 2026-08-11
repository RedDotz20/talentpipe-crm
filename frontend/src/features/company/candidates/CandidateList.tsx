import { Group, Loader, Pagination, Stack, Table, Title } from '@mantine/core';
import { ListControls } from '@/shared/components/ListControls';
import { useListQuery } from '@/shared/hooks/useListQuery';
import { useCandidates } from './hooks/useCandidates';

export function CandidateList({ onSelect }: { onSelect: (id: string) => void }) {
  const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
  const { data: result = { data: [], total: 0 }, isLoading } = useCandidates(
    listQuery.params,
  );
  const data = result.data;

  const rows = data.map((c) => (
    <Table.Tr
      key={c.id}
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(c.id)}
    >
      <Table.Td>{c.name}</Table.Td>
      <Table.Td>{c.email ?? '—'}</Table.Td>
      <Table.Td>{c.phone ?? '—'}</Table.Td>
      <Table.Td>{new Date(c.createdAt).toLocaleDateString()}</Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack>
      <Title order={2}>Candidates</Title>
      <ListControls
        searchPlaceholder="Search name or email"
        searchValue={listQuery.search}
        onSearchChange={(value) => {
          listQuery.setSearch(value);
          listQuery.setPage(1);
        }}
        sortOptions={[
          { value: 'name', label: 'Name' },
          { value: 'createdAt', label: 'Date created' },
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
        <Loader />
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Phone</Table.Th>
              <Table.Th>Created</Table.Th>
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
