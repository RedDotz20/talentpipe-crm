import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Stack,
  Stepper,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link } from '@tanstack/react-router';
import { useApplicationDetail, useApplications, useWithdrawApplication } from '../hooks';
import type { Application } from '../types';

const statusColors: Record<string, string> = {
  Applied: 'blue',
  Screening: 'yellow',
  Interview: 'purple',
  Offer: 'green',
  Hired: 'teal',
  Rejected: 'red',
};

const PIPELINE = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'];

const pipelineStep = (status: string): number => {
  const index = PIPELINE.indexOf(status);
  if (index !== -1) return index;
  return status === 'Rejected' ? PIPELINE.length - 1 : 0;
};

export function ApplicationsPage() {
  const { data: applications = [], isLoading, error } = useApplications();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const applicationDetail = useApplicationDetail(selectedApplicationId);
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null);
  const [withdrawOpened, withdrawHandlers] = useDisclosure(false);
  const withdraw = useWithdrawApplication();

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

  const openWithdraw = (app: Application) => {
    setWithdrawTarget(app);
    withdrawHandlers.open();
  };

  const confirmWithdraw = () => {
    if (!withdrawTarget) return;
    withdraw.mutate(withdrawTarget.applicationId, {
      onSuccess: () => {
        withdrawHandlers.close();
        setWithdrawTarget(null);
        setSelectedApplicationId(null);
      },
    });
  };

  const rows = applications.map((app: Application) => (
    <Table.Tr key={app.applicationId}>
      <Table.Td>
        <Link
          to="/jobs/$jobId"
          params={{ jobId: app.jobPostingId }}
          search={{ tenantId: app.tenantId }}
        >
          {app.jobTitle}
        </Link>
      </Table.Td>
      <Table.Td>{app.companyName}</Table.Td>
      <Table.Td>
        <Badge color={statusColors[app.status] ?? 'gray'}>{app.status}</Badge>
      </Table.Td>
      <Table.Td>{new Date(app.appliedAt).toLocaleDateString()}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => setSelectedApplicationId(app.applicationId)}>
            Details
          </Button>
          <Button size="xs" variant="outline" color="red" onClick={() => openWithdraw(app)}>
            Withdraw
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  const detail = applicationDetail.data;

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
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
      <Drawer
        opened={!!selectedApplicationId}
        onClose={() => setSelectedApplicationId(null)}
        title={detail?.jobTitle ?? 'Application details'}
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
        {detail && (
          <Stack gap="md">
            <Text>
              <Text span fw={600}>Status: </Text>
              <Badge color={statusColors[detail.status] ?? 'gray'}>{detail.status}</Badge>
            </Text>
            <Stepper active={pipelineStep(detail.status)} size="xs" color={detail.status === 'Rejected' ? 'red' : undefined}>
              {PIPELINE.map((step) => (
                <Stepper.Step key={step} label={step} />
              ))}
            </Stepper>
            <Text>
              <Text span fw={600}>Company: </Text>
              {detail.companyName}
            </Text>
            <Text>
              <Text span fw={600}>Job title: </Text>
              {detail.jobTitle}
            </Text>
            <Text>
              <Text span fw={600}>Applied: </Text>
              {new Date(detail.appliedAt).toLocaleDateString()}
            </Text>
            <Text>
              <Text span fw={600}>Match score: </Text>
              {detail.matchScore === null
                ? '—'
                : `${Math.round(detail.matchScore * 100)}%`}
            </Text>
            <Stack gap="xs">
              <Text fw={600}>Cover letter</Text>
              <Text style={{ whiteSpace: 'pre-wrap' }}>
                {detail.coverLetter ?? 'No cover letter provided.'}
              </Text>
            </Stack>
            <Button color="red" variant="outline" onClick={() => openWithdraw(detail)}>
              Withdraw application
            </Button>
          </Stack>
        )}
      </Drawer>
      <Modal
        opened={withdrawOpened}
        onClose={withdrawHandlers.close}
        title="Withdraw application"
        centered
      >
        {withdrawTarget && (
          <Stack gap="md">
            <Text>
              Are you sure you want to withdraw your application for{' '}
              <Text span fw={600}>{withdrawTarget.jobTitle}</Text> at{' '}
              <Text span fw={600}>{withdrawTarget.companyName}</Text>?
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={withdrawHandlers.close}>
                Cancel
              </Button>
              <Button color="red" loading={withdraw.isPending} onClick={confirmWithdraw}>
                Withdraw
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
