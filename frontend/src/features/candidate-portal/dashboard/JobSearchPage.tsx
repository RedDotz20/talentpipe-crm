import { Alert, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useJobs } from '../hooks';
import type { Job } from '../types';

export function JobSearchPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();

  if (jobsLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (jobsError) {
    return <Alert color="red">Failed to load jobs: {jobsError.message}</Alert>;
  }

  if (jobs.length === 0) {
    return <Text>No jobs available</Text>;
  }

  return (
    <Stack>
      <Title order={2}>Job Search</Title>
      {jobs.map((job: Job) => (
        <Card key={job.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <div>
              <Title order={4}>{job.title}</Title>
              <Text size="sm" c="dimmed">{job.companyName}</Text>
            </div>
          </Group>
          <Button
            component={Link}
            to="/jobs/$jobId"
            params={{ jobId: job.id }}
            search={{ tenantId: job.tenantId }}
          >
            View details
          </Button>
        </Card>
      ))}
    </Stack>
  );
}
