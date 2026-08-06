import {
  Badge,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { usePlatformStats, usePlatformTenants } from './hooks/usePlatform';

export function TenantsPage() {
  const tenantsQuery = usePlatformTenants();
  const statsQuery = usePlatformStats();

  const tenants = tenantsQuery.data ?? [];

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Platform</Title>
      </Group>

      {statsQuery.isLoading ? (
        <Loader />
      ) : (
        <SimpleGrid cols={3} mb="lg">
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Tenants
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.tenants ?? 0}
            </Text>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Users
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.users ?? 0}
            </Text>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Applications
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.applications ?? 0}
            </Text>
          </Card>
        </SimpleGrid>
      )}

      {tenantsQuery.isLoading ? (
        <Loader />
      ) : tenants.length === 0 ? (
        <Text c="dimmed">No tenants yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Company</Table.Th>
              <Table.Th>Slug</Table.Th>
              <Table.Th>Plan</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tenants.map((tenant) => (
              <Table.Tr
                key={tenant.id}
                component={Link}
                to="/admin/tenants/$tenantId"
                params={{ tenantId: tenant.id }}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>{tenant.name}</Table.Td>
                <Table.Td>{tenant.slug}</Table.Td>
                <Table.Td>{tenant.plan}</Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={tenant.status === 'suspended' ? 'red' : 'green'}
                  >
                    {tenant.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{dayjs(tenant.createdAt).format('MMM D, YYYY')}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
