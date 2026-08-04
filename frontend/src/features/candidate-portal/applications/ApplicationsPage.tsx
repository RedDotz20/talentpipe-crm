import { useState } from 'react';
import {
  Alert,
  Badge,
  Drawer,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useApplicationDetail, useApplications } from '../hooks';
import type { Application } from '../types';

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
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const applicationDetail = useApplicationDetail(selectedApplicationId);

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
    <Table.Tr
      key={app.applicationId}
      style={{ cursor: 'pointer' }}
      onClick={() => setSelectedApplicationId(app.applicationId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setSelectedApplicationId(app.applicationId);
        }
      }}
      tabIndex={0}
    >
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
      <Drawer
        opened={!!selectedApplicationId}
        onClose={() => setSelectedApplicationId(null)}
        title={applicationDetail.data?.jobTitle ?? 'Application details'}
        position="right"
        size="md"
      >
        {applicationDetail.isLoading && (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        )}
        {applicationDetail.error && (
          <Alert color="red">
            Failed to load application: {applicationDetail.error.message}
          </Alert>
        )}
        {applicationDetail.data && (
          <Stack gap="md">
            <Text>
              <Text span fw={600}>Status: </Text>
              <Badge color={statusColors[applicationDetail.data.status] ?? 'gray'}>
                {applicationDetail.data.status}
              </Badge>
            </Text>
            <Text>
              <Text span fw={600}>Company: </Text>
              {applicationDetail.data.companyName}
            </Text>
            <Text>
              <Text span fw={600}>Job title: </Text>
              {applicationDetail.data.jobTitle}
            </Text>
            <Text>
              <Text span fw={600}>Applied: </Text>
              {new Date(applicationDetail.data.appliedAt).toLocaleDateString()}
            </Text>
            <Text>
              <Text span fw={600}>Match score: </Text>
              {applicationDetail.data.matchScore === null
                ? '—'
                : `${Math.round(applicationDetail.data.matchScore * 100)}%`}
            </Text>
            <Stack gap="xs">
              <Text fw={600}>Cover letter</Text>
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {applicationDetail.data.coverLetter ?? 'No cover letter provided.'}
              </Text>
            </Stack>
          </Stack>
        )}
      </Drawer>
    </>
  );
}
