import { useState } from 'react';
import { Card, Text, Title, Badge, Button, Group, Stack, Loader, Modal, TextInput, Textarea, Alert, MultiSelect } from '@mantine/core';
import { useJobs, useApply, useAllSkills, useProfile } from '../hooks';
import type { Job, Skill } from '../types';

export function JobSearchPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();
  const { mutate: apply, isPending: isApplying, reset: resetApply } = useApply();
  const { data: profile } = useProfile();
  const { data: allSkills = [] } = useAllSkills();

  // Apply modal state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [applyPhone, setApplyPhone] = useState('');
  const [applyCoverLetter, setApplyCoverLetter] = useState('');
  const [applySkillIds, setApplySkillIds] = useState<string[]>([]);
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
    setApplyPhone(profile?.phone ?? '');
    setApplyCoverLetter('');
    setApplySkillIds(profile?.skills.map((s: Skill) => s.id) ?? []);
    setApplySuccess(false);
    setApplyError('');
    setApplyModalOpen(true);
  };

  const handleApply = () => {
    if (!selectedJobId) return;
    apply(
      {
        tenantId: jobs.find((job) => job.id === selectedJobId)?.tenantId ?? '',
        jobId: selectedJobId,
        data: {
          phone: applyPhone || undefined,
          coverLetter: applyCoverLetter || undefined,
          skillIds: applySkillIds.length > 0 ? applySkillIds : undefined,
        },
      },
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
    setApplySkillIds([]);
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
            <Text size="sm">Applying as {profile?.firstName} {profile?.lastName} ({profile?.email})</Text>
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
            <MultiSelect
              label="Skills"
              placeholder="Select or search skills"
              data={allSkills.map((s: Skill) => ({ label: s.name, value: s.id }))}
              value={applySkillIds}
              onChange={setApplySkillIds}
              searchable
              clearable
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
