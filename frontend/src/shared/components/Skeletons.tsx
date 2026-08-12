import { Card, Group, SimpleGrid, Skeleton, Stack, Table } from '@mantine/core';

export function TableSkeleton({
  headers,
  rows = 5,
}: {
  headers?: string[];
  rows?: number;
}) {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          {(headers ?? Array.from({ length: 4 })).map((header, index) => (
            <Table.Th key={index}>
              {headers ? (
                header
              ) : (
                <Skeleton height={14} width="70%" />
              )}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {Array.from({ length: rows }).map((_, row) => (
          <Table.Tr key={row}>
            {Array.from({ length: headers?.length ?? 4 }).map((_, cell) => (
              <Table.Td key={cell}>
                <Skeleton height={14} width={`${70 - (cell % 3) * 15}%`} />
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function CardGridSkeleton({
  count = 6,
  cols = { base: 1, sm: 2, xl: 3 },
}: {
  count?: number;
  cols?: Record<string, number>;
}) {
  return (
    <SimpleGrid cols={cols} spacing="lg">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} withBorder padding="lg" radius="md">
          <Stack gap="sm">
            <Skeleton height={20} width="60%" />
            <Skeleton height={12} width="40%" />
            <Group gap="xs">
              <Skeleton height={20} width={64} radius="sm" />
              <Skeleton height={20} width={64} radius="sm" />
              <Skeleton height={20} width={64} radius="sm" />
            </Group>
            <Skeleton height={12} width="30%" />
            <Group justify="space-between" mt="sm">
              <Skeleton height={28} width={80} radius="sm" />
              <Skeleton height={28} width={96} radius="sm" />
            </Group>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

export function DetailSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <Stack gap="md">
      <Skeleton height={26} width="45%" />
      <Skeleton height={14} width="30%" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} height={12} width={`${90 - (index % 3) * 15}%`} />
      ))}
    </Stack>
  );
}

export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
      {Array.from({ length: columns }).map((_, column) => (
        <Card key={column} w={280} withBorder style={{ flexShrink: 0 }}>
          <Card.Section withBorder inheritPadding py="xs">
            <Group justify="space-between">
              <Skeleton height={16} width="55%" />
              <Skeleton height={20} width={32} radius="sm" />
            </Group>
          </Card.Section>
          <Stack gap="xs" mt="xs">
            {Array.from({ length: 3 }).map((_, card) => (
              <Card key={card} withBorder padding="sm" radius="md">
                <Stack gap="xs">
                  <Skeleton height={14} width="70%" />
                  <Skeleton height={12} width="45%" />
                  <Skeleton height={12} width="55%" />
                </Stack>
              </Card>
            ))}
          </Stack>
        </Card>
      ))}
    </Group>
  );
}
