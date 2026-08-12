import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { AreaChart, BarChart, DonutChart } from '@mantine/charts';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { useDashboardSummary } from './hooks/useDashboardSummary';
import type { TimeUnit } from '@/shared/types/dashboard';

const UNIT_LABELS: Record<TimeUnit, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

function ChartCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="lg" p="md">
      <Group justify="space-between" mb="md">
        <Title order={3} size="h4">
          {title}
        </Title>
        {actions}
      </Group>
      {children}
    </Paper>
  );
}

function ChartEmpty({ label = 'No data yet' }: { label?: string }) {
  return (
    <Text c="dimmed" ta="center" py={48}>
      {label}
    </Text>
  );
}

export function CompanyDashboardPage() {
  const { data: summary, isLoading, error } = useDashboardSummary();
  const [unit, setUnit] = useState<TimeUnit>('day');

  if (isLoading) {
    return (
      <Stack gap="xl">
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          {Array.from({ length: 4 }).map((_, index) => (
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

  const unitSelector = (
    <SegmentedControl
      size="xs"
      value={unit}
      onChange={(value) => setUnit(value as TimeUnit)}
      data={Object.entries(UNIT_LABELS).map(([value, label]) => ({
        value,
        label,
      }))}
    />
  );

  const rejectionRate = summary.rejection.total
    ? Math.round((summary.rejection.rejected / summary.rejection.total) * 100)
    : 0;
  const overTime = summary.applicationsOverTime[unit];

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
        <Paper withBorder p="lg" radius="lg">
          <Text size="xs" tt="uppercase" fw={500} c="dimmed" mb={4}>
            Rejection rate
          </Text>
          <Text size="xl" fw={700}>
            {rejectionRate}%
          </Text>
          <Text size="xs" c="dimmed">
            {summary.rejection.rejected} of {summary.rejection.total} applications
          </Text>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <ChartCard title="Applications over time" actions={unitSelector}>
          {overTime.every((point) => point.count === 0) ? (
            <ChartEmpty />
          ) : (
            <AreaChart
              h={260}
              data={overTime}
              dataKey="label"
              series={[{ name: 'count', color: 'indigo.6' }]}
              curveType="monotone"
              withGradient
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
        </ChartCard>

        <ChartCard title="Applications by stage">
          {summary.applicationsByStage.length === 0 ? (
            <ChartEmpty />
          ) : (
            <DonutChart
              h={260}
              data={summary.applicationsByStage.map((stage, index) => ({
                name: stage.stageName,
                value: stage.count,
                color: ['indigo.6', 'teal.6', 'grape.6', 'orange.6', 'green.6', 'red.6'][index % 6],
              }))}
              withLabelsLine
              withTooltip
            />
          )}
        </ChartCard>

        <ChartCard title="Top jobs by applications">
          {summary.topJobsByApplications.length === 0 ? (
            <ChartEmpty />
          ) : (
            <BarChart
              h={280}
              data={summary.topJobsByApplications}
              dataKey="title"
              series={[{ name: 'count', color: 'teal.6' }]}
              withLegend={false}
              xAxisProps={{ angle: -20, textAnchor: 'end', height: 60 }}
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
        </ChartCard>

        <ChartCard title="Interview status">
          {summary.interviewStatusBreakdown.length === 0 ? (
            <ChartEmpty />
          ) : (
            <DonutChart
              h={260}
              data={summary.interviewStatusBreakdown.map((entry) => ({
                name: entry.status,
                value: entry.count,
                color:
                  entry.status === 'scheduled'
                    ? 'indigo.6'
                    : entry.status === 'completed'
                      ? 'green.6'
                      : 'red.6',
              }))}
              withLabelsLine
              withTooltip
            />
          )}
        </ChartCard>

        <ChartCard title="Jobs by status">
          {summary.jobsByStatus.length === 0 ? (
            <ChartEmpty />
          ) : (
            <BarChart
              h={240}
              data={summary.jobsByStatus}
              dataKey="status"
              series={[{ name: 'count', color: 'indigo.6' }]}
              withLegend={false}
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
        </ChartCard>

        <ChartCard title="Jobs by employment type">
          {summary.jobsByEmploymentType.length === 0 ? (
            <ChartEmpty />
          ) : (
            <DonutChart
              h={260}
              data={summary.jobsByEmploymentType.map((entry, index) => ({
                name: entry.type,
                value: entry.count,
                color: ['indigo.6', 'teal.6', 'grape.6', 'orange.6'][index % 4],
              }))}
              withLabelsLine
              withTooltip
            />
          )}
        </ChartCard>
      </SimpleGrid>
    </Stack>
  );
}
