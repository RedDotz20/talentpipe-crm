import { useState } from 'react';
import { Alert, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useJobs } from '../hooks';
import { CandidateApplyModal } from '../applications/CandidateApplyModal';
import type { Job } from '../types';

export function JobSearchPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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

  const selectedJob = jobs.find((job) => job.id === selectedJobId);

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
          <Button onClick={() => setSelectedJobId(job.id)}>Apply</Button>
        </Card>
      ))}
      {selectedJob && (
        <CandidateApplyModal
          opened
          onClose={() => setSelectedJobId(null)}
          job={selectedJob}
        />
      )}
    </Stack>
  );
}
