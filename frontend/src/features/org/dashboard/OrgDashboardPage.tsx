import {
  Alert,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDashboardSummary } from './hooks/useDashboardSummary';

const summaryCards = [
  { key: 'totalApplications', label: 'Applications' },
  { key: 'totalCandidates', label: 'Candidates' },
  { key: 'openJobPostings', label: 'Open jobs' },
] as const;

export function OrgDashboardPage() {
  const { data: summary, isLoading, error } = useDashboardSummary();

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Alert color="red">Failed to load dashboard: {error.message}</Alert>;
  }

  if (!summary) {
    return <Alert color="red">Dashboard summary is unavailable.</Alert>;
  }

  return (
    <Stack gap="xl">
      <Title order={2}>Dashboard</Title>

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {summaryCards.map((card) => (
          <Card key={card.key} withBorder shadow="sm" padding="lg">
            <Text size="sm" c="dimmed">{card.label}</Text>
            <Text size="2rem" fw={700}>{summary[card.key]}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card withBorder shadow="sm" padding="lg">
        <Title order={3} mb="md">Applications by stage</Title>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Stage</Table.Th>
              <Table.Th>Applications</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {summary.applicationsByStage.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={2}>
                  <Text c="dimmed">No applications yet.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              summary.applicationsByStage.map((stage) => (
                <Table.Tr key={stage.stageId}>
                  <Table.Td>{stage.stageName}</Table.Td>
                  <Table.Td>{stage.count}</Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
