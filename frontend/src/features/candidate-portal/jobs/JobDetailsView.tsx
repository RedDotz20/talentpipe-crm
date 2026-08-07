import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';

interface JobDetailsViewProps {
  job: {
    title: string;
    companyName: string;
    description?: string | null;
    requiredSkills?: { id: string; name: string }[];
  };
  onApply: () => void;
  applyLabel?: string;
  backLink?: ReactNode;
}

export function JobDetailsView({
  job,
  onApply,
  applyLabel = 'Apply now',
  backLink,
}: JobDetailsViewProps) {
  return (
    <Stack gap="xl">
      {backLink}
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
          <Button onClick={onApply} size="md">
            {applyLabel}
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
