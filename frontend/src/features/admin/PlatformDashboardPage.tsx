import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Grid,
  Paper,
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
import {
  CATEGORY_AXIS_PROPS,
  CHART_HEIGHT,
  ChartCard,
  ChartEmpty,
  countFormatter,
  UnitSelector,
} from '@/shared/components/dashboard-charts';

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

export function PlatformDashboardPage() {
  const { data, isLoading, error } = usePlatformDashboard();
  const [unit, setUnit] = useState<TimeUnit>('day');

  if (isLoading) {
    return (
      <Stack gap="xl">
        <Title order={2}>Dashboard</Title>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="lg">
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

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 9 }}>
          <ChartCard
            title="Companies over time"
            actions={<UnitSelector value={unit} onChange={setUnit} />}
          >
            {overTime.every((point) => point.count === 0) ? (
              <ChartEmpty height={CHART_HEIGHT.area} />
            ) : (
              <AreaChart
                h={CHART_HEIGHT.area}
                data={overTime}
                dataKey="label"
                series={[{ name: 'count', color: 'indigo.6' }]}
                curveType="monotone"
                withGradient
                xAxisProps={{ interval: 'preserveStartEnd' }}
                valueFormatter={countFormatter}
              />
            )}
          </ChartCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 3 }}>
          <ChartCard title="Tenant status">
            {data.activeCompanies + data.suspendedCompanies === 0 ? (
              <ChartEmpty height={CHART_HEIGHT.area} />
            ) : (
              <DonutChart
                h={CHART_HEIGHT.area}
                data={[
                  {
                    name: 'Active',
                    value: data.activeCompanies,
                    color: 'green.6',
                  },
                  {
                    name: 'Suspended',
                    value: data.suspendedCompanies,
                    color: 'red.6',
                  },
                ]}
                withLegend
              />
            )}
          </ChartCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <ChartCard title="Applications per company (top 10)">
            {data.applicationsPerCompany.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT.bar} />
            ) : (
              <BarChart
                h={CHART_HEIGHT.bar}
                data={data.applicationsPerCompany}
                dataKey="companyName"
                series={[{ name: 'count', color: 'indigo.6' }]}
                withLegend={false}
                xAxisProps={CATEGORY_AXIS_PROPS}
                valueFormatter={countFormatter}
              />
            )}
          </ChartCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <ChartCard title="Users per company (top 10)">
            {data.usersPerCompany.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT.bar} />
            ) : (
              <BarChart
                h={CHART_HEIGHT.bar}
                data={data.usersPerCompany}
                dataKey="companyName"
                series={[{ name: 'count', color: 'teal.6' }]}
                withLegend={false}
                xAxisProps={CATEGORY_AXIS_PROPS}
                valueFormatter={countFormatter}
              />
            )}
          </ChartCard>
        </Grid.Col>

        <Grid.Col span={12}>
          <ChartCard title="Jobs by status per company (top 10)">
            {data.jobsByStatusPerCompany.length === 0 ? (
              <ChartEmpty height={CHART_HEIGHT.stacked} />
            ) : (
              <BarChart
                h={CHART_HEIGHT.stacked}
                data={data.jobsByStatusPerCompany}
                dataKey="companyName"
                type="stacked"
                series={[
                  { name: 'open', color: 'green.6', stackId: 'a' },
                  { name: 'draft', color: 'gray.5', stackId: 'a' },
                  { name: 'closed', color: 'red.6', stackId: 'a' },
                ]}
                withLegend
                xAxisProps={CATEGORY_AXIS_PROPS}
                valueFormatter={countFormatter}
              />
            )}
          </ChartCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
