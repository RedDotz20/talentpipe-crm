import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { platformApi } from '@/api/platformApi';
import { queryKeys } from '@/api/queryKeys';
import type { TimeUnit } from '@/shared/types/dashboard';

const UNIT_LABELS: Record<TimeUnit, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

function usePlatformDashboard() {
  return useQuery({
    queryKey: queryKeys.platform.dashboard(),
    queryFn: platformApi.getDashboard,
  });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Paper withBorder p="lg" radius="lg">
      <Text size="xs" tt="uppercase" fw={500} c="dimmed" mb={4}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Paper>
  );
}

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
        <Title order={4}>{title}</Title>
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

export function PlatformDashboardPage() {
  const { data, isLoading, error } = usePlatformDashboard();
  const [unit, setUnit] = useState<TimeUnit>('day');

  if (isLoading) {
    return (
      <Stack gap="xl">
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 1, sm: 3, lg: 6 }} spacing="lg">
          {Array.from({ length: 6 }).map((_, index) => (
            <Paper key={index} withBorder p="lg" radius="lg">
              <Skeleton height={12} width="60%" mb={8} />
              <Skeleton height={24} width="40%" />
            </Paper>
          ))}
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <Paper withBorder p="md" radius="lg">
            <Skeleton height={220} />
          </Paper>
          <Paper withBorder p="md" radius="lg">
            <Skeleton height={220} />
          </Paper>
        </SimpleGrid>
      </Stack>
    );
  }

  if (error) {
    return <Alert color="red">Failed to load dashboard: {error.message}</Alert>;
  }

  if (!data) {
    return <Alert color="red">Dashboard data is unavailable.</Alert>;
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

  const overTime = data.companiesOverTime[unit];

  return (
    <Stack gap="xl">
      <Title order={2}>Dashboard</Title>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="lg">
        <StatCard label="Companies" value={data.companies} />
        <StatCard label="Active" value={data.activeCompanies} />
        <StatCard label="Suspended" value={data.suspendedCompanies} />
        <StatCard label="Users" value={data.users} />
        <StatCard label="Applications" value={data.applications} />
        <StatCard label="Jobs" value={data.jobs} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <ChartCard title="Companies over time" actions={unitSelector}>
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

        <ChartCard title="Tenant status">
          {data.activeCompanies + data.suspendedCompanies === 0 ? (
            <ChartEmpty />
          ) : (
            <DonutChart
              h={260}
              data={[
                { name: 'Active', value: data.activeCompanies, color: 'green.6' },
                {
                  name: 'Suspended',
                  value: data.suspendedCompanies,
                  color: 'red.6',
                },
              ]}
              withLabelsLine
              withTooltip
            />
          )}
        </ChartCard>

        <ChartCard title="Applications per company (top 10)">
          {data.applicationsPerCompany.length === 0 ? (
            <ChartEmpty />
          ) : (
            <BarChart
              h={280}
              data={data.applicationsPerCompany}
              dataKey="companyName"
              series={[{ name: 'count', color: 'indigo.6' }]}
              withLegend={false}
              xAxisProps={{ angle: -20, textAnchor: 'end', height: 60 }}
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
        </ChartCard>

        <ChartCard title="Users per company (top 10)">
          {data.usersPerCompany.length === 0 ? (
            <ChartEmpty />
          ) : (
            <BarChart
              h={280}
              data={data.usersPerCompany}
              dataKey="companyName"
              series={[{ name: 'count', color: 'teal.6' }]}
              withLegend={false}
              xAxisProps={{ angle: -20, textAnchor: 'end', height: 60 }}
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
        </ChartCard>

        <ChartCard title="Jobs by status per company (top 10)">
          {data.jobsByStatusPerCompany.length === 0 ? (
            <ChartEmpty />
          ) : (
            <BarChart
              h={300}
              data={data.jobsByStatusPerCompany}
              dataKey="companyName"
              type="stacked"
              series={[
                { name: 'open', color: 'green.6', stackId: 'a' },
                { name: 'draft', color: 'gray.5', stackId: 'a' },
                { name: 'closed', color: 'red.6', stackId: 'a' },
              ]}
              withLegend
              xAxisProps={{ angle: -20, textAnchor: 'end', height: 60 }}
              valueFormatter={(value) => value.toLocaleString()}
            />
          )}
        </ChartCard>
      </SimpleGrid>
    </Stack>
  );
}
