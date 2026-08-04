import {
  Alert,
  Badge,
  Card,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { usePublicJobs } from './hooks/usePublicCareers';

interface JobListingPageProps {
  tenantSlug: string;
}

export function JobListingPage({ tenantSlug }: JobListingPageProps) {
  const { data: jobs = [], isLoading, error } = usePublicJobs(tenantSlug);

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <Group justify="center">
          <Loader />
        </Group>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Unable to load jobs">
          The careers page could not be loaded. Please try again later.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1}>Open positions</Title>
          <Text c="dimmed" mt="xs">
            Explore the latest opportunities and find your next role.
          </Text>
        </div>

        {jobs.length === 0 ? (
          <Alert color="blue">There are no open positions right now.</Alert>
        ) : (
          jobs.map((job) => (
            <Card key={job.id} withBorder padding="lg" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Title order={3}>{job.title}</Title>
                    <Text c="dimmed" size="sm">
                      {job.companyName}
                    </Text>
                  </div>
                  <Badge color="green">Open</Badge>
                </Group>
                <Text lineClamp={3}>{job.description ?? 'No description provided.'}</Text>
                <Link
                  to="/careers/$tenantSlug/jobs/$jobId"
                  params={{ tenantSlug, jobId: job.id }}
                >
                  View job details
                </Link>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Container>
  );
}
