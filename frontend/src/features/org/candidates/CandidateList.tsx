import { Loader, Stack, Table, Title } from '@mantine/core';
import { useCandidates } from './hooks/useCandidates';

export function CandidateList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = useCandidates();

  const rows = (data ?? []).map((c) => (
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
    </Stack>
  );
}
