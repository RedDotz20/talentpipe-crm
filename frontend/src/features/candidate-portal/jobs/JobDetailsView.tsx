import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { JobMetaBadges } from '@/shared/components/JobMetaBadges';

interface JobDetailsViewProps {
  job: {
    title: string;
    companyName: string;
    description?: string | null;
    employmentType?: string | null;
    location?: string | null;
    workSetup?: string | null;
    requiredSkills?: { id: string; name: string }[];
  };
  onApply: () => void;
  applyLabel?: string;
  backLink?: ReactNode;
  applied?: boolean;
  showAppliedAction?: boolean;
}

export function JobDetailsView({
  job,
  onApply,
  applyLabel = 'Apply now',
  backLink,
  applied = false,
  showAppliedAction = true,
}: JobDetailsViewProps) {
  return (
    <Stack gap="xl">
      {backLink}
      <div>
        <Group gap="sm">
          <Title order={1}>{job.title}</Title>
          {applied && (
            <Badge variant="light" color="green" size="lg">
              Applied
            </Badge>
          )}
        </Group>
        <Text c="dimmed" mt="xs">
          {job.companyName}
        </Text>
        <JobMetaBadges
          employmentType={job.employmentType}
          location={job.location}
          workSetup={job.workSetup}
        />
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
            {!job.requiredSkills || job.requiredSkills.length === 0 ? (
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
          {applied ? (
            showAppliedAction && (
              <Button
                component={Link}
                to="/applications"
                size="md"
                variant="light"
                color="green"
              >
                View my application
              </Button>
            )
          ) : (
            <Button onClick={onApply} size="md">
              {applyLabel}
            </Button>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
