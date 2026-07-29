import { useState } from 'react';
import { Card, Text, Title, Badge, Button, Group, Stack, Loader, Modal, TextInput, Textarea, Alert } from '@mantine/core';
import { useJobs, useApply } from '../hooks';
import type { Job } from '../types';

export function JobSearchPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();
  const { mutate: apply, isPending: isApplying, reset: resetApply } = useApply();

  // Apply modal state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [applyFirstName, setApplyFirstName] = useState('');
  const [applyLastName, setApplyLastName] = useState('');
  const [applyEmail, setApplyEmail] = useState('');
  const [applyPhone, setApplyPhone] = useState('');
  const [applyCoverLetter, setApplyCoverLetter] = useState('');
  const [applyResumeUrl, setApplyResumeUrl] = useState('');
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState('');

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

  const openApplyModal = (jobId: string) => {
    setSelectedJobId(jobId);
    setApplyFirstName('');
    setApplyLastName('');
    setApplyEmail('');
    setApplyPhone('');
    setApplyCoverLetter('');
    setApplyResumeUrl('');
    setApplySuccess(false);
    setApplyError('');
    setApplyModalOpen(true);
  };

  const handleApply = () => {
    if (!selectedJobId) return;
    apply(
      { jobId: selectedJobId, data: { firstName: applyFirstName, lastName: applyLastName, email: applyEmail, phone: applyPhone || undefined, coverLetter: applyCoverLetter || undefined, resumeUrl: applyResumeUrl || undefined } },
      {
        onSuccess: () => {
          setApplySuccess(true);
        },
        onError: () => {
          setApplyError('Failed to submit application');
        },
      }
    );
  };

  const closeModal = () => {
    setApplyModalOpen(false);
    setSelectedJobId(null);
    resetApply();
  };

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
            <Badge>{job.employmentType}</Badge>
          </Group>
          <Text size="sm" mb="md">{job.location}</Text>
          <Button onClick={() => openApplyModal(job.id)}>Apply</Button>
        </Card>
      ))}

      <Modal
        opened={applyModalOpen}
        onClose={closeModal}
        title="Apply for Job"
        size="md"
      >
        {applySuccess ? (
          <Stack>
            <Alert color="green">Application submitted successfully!</Alert>
            <Button onClick={closeModal}>Close</Button>
          </Stack>
        ) : (
          <Stack>
            {applyError && <Alert color="red">{applyError}</Alert>}
            <TextInput
              label="First Name"
              required
              value={applyFirstName}
              onChange={(e) => setApplyFirstName(e.currentTarget.value)}
            />
            <TextInput
              label="Last Name"
              required
              value={applyLastName}
              onChange={(e) => setApplyLastName(e.currentTarget.value)}
            />
            <TextInput
              label="Email"
              required
              type="email"
              value={applyEmail}
              onChange={(e) => setApplyEmail(e.currentTarget.value)}
            />
            <TextInput
              label="Phone"
              value={applyPhone}
              onChange={(e) => setApplyPhone(e.currentTarget.value)}
            />
            <Textarea
              label="Cover Letter"
              minRows={4}
              value={applyCoverLetter}
              onChange={(e) => setApplyCoverLetter(e.currentTarget.value)}
            />
            <TextInput
              label="Resume URL"
              placeholder="https://..."
              value={applyResumeUrl}
              onChange={(e) => setApplyResumeUrl(e.currentTarget.value)}
            />
            <Button onClick={handleApply} loading={isApplying} fullWidth mt="md">
              Submit Application
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
