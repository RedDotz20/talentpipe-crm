import type { ReactNode } from 'react';
import { Group, Paper, SegmentedControl, Text, Title } from '@mantine/core';
import type { TimeUnit } from '@/shared/types/dashboard';

export const UNIT_LABELS: Record<TimeUnit, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

export const CATEGORICAL_PALETTE = [
  'indigo.6',
  'teal.6',
  'grape.6',
  'orange.6',
  'cyan.6',
  'red.6',
] as const;

export const truncateLabel = (value: string, max = 18): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export const countFormatter = (value: number): string =>
  value.toLocaleString();

export const CATEGORY_AXIS_PROPS = {
  angle: -20,
  textAnchor: 'end' as const,
  height: 70,
  interval: 0,
  tickFormatter: truncateLabel,
};

export function ChartCard({
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

export function ChartEmpty({ label = 'No data yet' }: { label?: string }) {
  return (
    <Text c="dimmed" ta="center" py={48}>
      {label}
    </Text>
  );
}

export function UnitSelector({
  value,
  onChange,
}: {
  value: TimeUnit;
  onChange: (unit: TimeUnit) => void;
}) {
  return (
    <SegmentedControl
      size="xs"
      value={value}
      onChange={(next) => onChange(next as TimeUnit)}
      data={Object.entries(UNIT_LABELS).map(([unit, label]) => ({
        value: unit,
        label,
      }))}
    />
  );
}
