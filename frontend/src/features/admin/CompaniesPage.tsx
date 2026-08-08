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
import { usePlatformStats, usePlatformCompanies } from './hooks/usePlatform';

export function CompaniesPage() {
  const companiesQuery = usePlatformCompanies();
  const statsQuery = usePlatformStats();

  const companies = companiesQuery.data ?? [];

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
              Companies
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.companies ?? 0}
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

      {companiesQuery.isLoading ? (
        <Loader />
      ) : companies.length === 0 ? (
        <Text c="dimmed">No companies yet.</Text>
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
            {companies.map((company) => (
              <Table.Tr
                key={company.id}
                component={Link}
                to="/admin/companies/$companyId"
                params={{ companyId: company.id }}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>{company.name}</Table.Td>
                <Table.Td>{company.slug}</Table.Td>
                <Table.Td>{company.plan}</Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={company.status === 'suspended' ? 'red' : 'green'}
                  >
                    {company.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{dayjs(company.createdAt).format('MMM D, YYYY')}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
