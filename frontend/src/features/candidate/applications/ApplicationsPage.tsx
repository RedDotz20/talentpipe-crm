import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Title, Table, Badge, Loader, Group, Text } from '@mantine/core';
import { useAuthStore } from '../../../shared/api/useAuth';

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
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

  const getAuthHeaders = () => {
    const token = useAuthStore.getState().accessToken;
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  };

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      navigate({ to: '/candidate/login' });
      return;
    }

    setLoading(true);
    fetch(`${apiBase}/candidate/applications`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch applications');
        return res.json();
      })
      .then((data) => {
        setApplications(Array.isArray(data) ? data : data.applications ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load applications');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Text c="red">{error}</Text>;
  }

  if (applications.length === 0) {
    return <Text>No applications yet</Text>;
  }

  const rows = applications.map((app) => (
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
