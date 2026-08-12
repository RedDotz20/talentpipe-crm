import {
  Alert,
  Stack,
  Table,
  Text,
  Title,
  Badge,
  SimpleGrid,
  Paper,
  Skeleton,
} from '@mantine/core';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { useDashboardSummary } from './hooks/useDashboardSummary';

export function CompanyDashboardPage() {
  const { data: summary, isLoading, error } = useDashboardSummary();

  if (isLoading) {
    return (
      <Stack gap="xl">
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          {Array.from({ length: 3 }).map((_, index) => (
            <Paper key={index} withBorder p="lg" radius="lg">
              <Skeleton height={12} width="50%" mb={8} />
              <Skeleton height={24} width="35%" />
            </Paper>
          ))}
        </SimpleGrid>
        <div>
          <Skeleton height={20} width={200} mb="md" />
          <TableSkeleton headers={['Stage', 'Applications']} rows={4} />
        </div>
      </Stack>
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
