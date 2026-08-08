import {
  Alert,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  Badge,
  SimpleGrid,
  Paper,
} from '@mantine/core';
import { useDashboardSummary } from './hooks/useDashboardSummary';

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

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
        <Paper withBorder p="lg" radius="lg">
          <Text size="xs" tt="uppercase" fw={500} c="dimmed" mb={4}>
            Applications
          </Text>
          <Text size="xl" fw={700}>
            {summary.totalApplications}
          </Text>
        </Paper>
        <Paper withBorder p="lg" radius="lg">
          <Text size="xs" tt="uppercase" fw={500} c="dimmed" mb={4}>
            Candidates
          </Text>
          <Text size="xl" fw={700}>
            {summary.totalCandidates}
          </Text>
        </Paper>
        <Paper withBorder p="lg" radius="lg">
          <Text size="xs" tt="uppercase" fw={500} c="dimmed" mb={4}>
            Open jobs
          </Text>
          <Text size="xl" fw={700}>
            {summary.openJobPostings}
          </Text>
        </Paper>
      </SimpleGrid>

      <div>
        <Title order={3} mb="md">
          Applications by stage
        </Title>
        <Paper withBorder radius="lg">
          <Table>
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
                    <Table.Td>
                      <Badge variant="light" color="indigo">
                        {stage.count}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      </div>
    </Stack>
  );
}
