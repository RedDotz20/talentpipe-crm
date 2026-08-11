import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { JobMetaBadges } from '@/shared/components/JobMetaBadges';
import { useApplications, useJobs } from '../hooks';
import type { Job } from '../types';

export function JobSearchPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();
  const { data: applications = [] } = useApplications();

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

  const appliedKeys = new Set(
    applications.map((app) => `${app.companyId}:${app.jobPostingId}`),
  );
  const isApplied = (job: Job) =>
    appliedKeys.has(`${job.companyId}:${job.jobPostingId ?? job.id}`);

  return (
    <Stack>
      <Title order={2}>Job Search</Title>
      {jobs.map((job: Job) => (
        <Card key={job.id} shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <div>
              <Group gap="sm">
                <Title order={4}>{job.title}</Title>
                {isApplied(job) && (
                  <Badge variant="light" color="green" size="sm">
                    Applied
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">{job.companyName}</Text>
              <JobMetaBadges
                employmentType={job.employmentType}
                location={job.location}
                workSetup={job.workSetup}
              />
            </div>
          </Group>
          <Button
            component={Link}
            to="/jobs/$jobId"
            params={{ jobId: job.id }}
            search={{ companyId: job.companyId }}
          >
            View details
          </Button>
        </Card>
      ))}
    </Stack>
  );
}
