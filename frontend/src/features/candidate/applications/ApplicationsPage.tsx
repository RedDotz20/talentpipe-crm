import { Title, Table, Badge, Loader, Group, Text, Alert } from '@mantine/core';
import { useApplications } from '../../../shared/hooks/useApplications';

interface Application {
  id: string;
  jobTitle: string;
  companyName: string;
  status: string;
  appliedAt: string;
}

const statusColors: Record<string, string> = {
  pending: 'yellow',
  reviewed: 'blue',
  interviewed: 'purple',
  offered: 'green',
  rejected: 'red',
  withdrawn: 'gray',
};

export function ApplicationsPage() {
  const { data: applications = [], isLoading, error } = useApplications();

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Alert color="red">Failed to load applications: {error.message}</Alert>;
  }

  if (applications.length === 0) {
    return <Text>No applications yet</Text>;
  }

  const rows = applications.map((app: Application) => (
    <Table.Tr key={app.id}>
      <Table.Td>{app.jobTitle}</Table.Td>
      <Table.Td>{app.companyName}</Table.Td>
      <Table.Td>
        <Badge color={statusColors[app.status] ?? 'gray'}>
          {app.status}
        </Badge>
      </Table.Td>
      <Table.Td>{new Date(app.appliedAt).toLocaleDateString()}</Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Title order={2} mb="md">My Applications</Title>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Job Title</Table.Th>
            <Table.Th>Company</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Applied Date</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </>
  );
}