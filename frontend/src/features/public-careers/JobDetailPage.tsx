import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { usePublicJob } from './hooks/usePublicCareers';

interface JobDetailPageProps {
  tenantSlug: string;
  jobId: string;
  onApply?: () => void;
}

export function JobDetailPage({
  tenantSlug,
  jobId,
  onApply,
}: JobDetailPageProps) {
  const { data: job, isLoading, error } = usePublicJob(tenantSlug, jobId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <Group justify="center">
          <Loader />
        </Group>
      </Container>
    );
  }

  if (error || !job) {
    return (
      <Container size="md" py="xl">
        <Stack gap="md">
          <Alert color="red" title="Job not found">
            This position is no longer available or could not be loaded.
          </Alert>
          <Button
            onClick={() =>
              navigate({ to: '/careers/$tenantSlug/jobs', params: { tenantSlug } })
            }
            variant="light"
          >
            Back to open positions
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Link to="/careers/$tenantSlug/jobs" params={{ tenantSlug }}>
          Back to open positions
        </Link>

        <div>
          <Title order={1}>{job.title}</Title>
          <Text c="dimmed" mt="xs">
            {job.companyName}
          </Text>
        </div>

        <Card withBorder padding="xl" radius="md">
          <Stack gap="lg">
            <div>
              <Title order={3}>About the role</Title>
              <Text mt="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {job.description ?? 'No description provided.'}
              </Text>
            </div>

            <div>
              <Title order={3}>Required skills</Title>
              {job.requiredSkills.length === 0 ? (
                <Text c="dimmed" mt="sm">
                  No specific skills listed.
                </Text>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="sm">
                  {job.requiredSkills.map((skill) => (
                    <Badge key={skill.id} variant="light" size="lg">
                      {skill.name}
                    </Badge>
                  ))}
                </SimpleGrid>
              )}
            </div>

            {onApply && (
              <Button onClick={onApply} size="md">
                Apply now
              </Button>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
