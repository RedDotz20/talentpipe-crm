import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, Text, Title, Badge, Button, Group, Stack, Loader, Modal, TextInput, Textarea, Alert } from '@mantine/core';
import { useAuthStore } from '../../../shared/api/useAuth';

interface Job {
  id: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
}

export function JobSearchPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Apply modal state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [applyFirstName, setApplyFirstName] = useState('');
  const [applyLastName, setApplyLastName] = useState('');
  const [applyEmail, setApplyEmail] = useState('');
  const [applyPhone, setApplyPhone] = useState('');
  const [applyCoverLetter, setApplyCoverLetter] = useState('');
  const [applyResumeUrl, setApplyResumeUrl] = useState('');
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState('');

  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

  const getAuthHeaders = (): Record<string, string> => {
    const token = useAuthStore.getState().accessToken;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      navigate({ to: '/candidate/login' });
      return;
    }

    setLoading(true);
    fetch(`${apiBase}/candidate/jobs`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch jobs');
        return res.json();
      })
      .then((data) => {
        setJobs(Array.isArray(data) ? data : data.jobs ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load jobs');
        setLoading(false);
      });
  }, []);

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

  const handleApply = async () => {
    if (!selectedJobId) return;
    setApplySubmitting(true);
    setApplyError('');
    try {
      const res = await fetch(`${apiBase}/candidate/jobs/${selectedJobId}/apply`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          firstName: applyFirstName,
          lastName: applyLastName,
          email: applyEmail,
          phone: applyPhone,
          coverLetter: applyCoverLetter,
          resumeUrl: applyResumeUrl,
        }),
      });
      if (!res.ok) throw new Error('Application failed');
      setApplySuccess(true);
      setApplySubmitting(false);
    } catch {
      setApplyError('Failed to submit application');
      setApplySubmitting(false);
    }
  };

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return <Text c="red">{error}</Text>;
  }

  if (jobs.length === 0) {
    return <Text>No jobs available</Text>;
  }

  return (
    <Stack>
      <Title order={2}>Job Search</Title>
      {jobs.map((job) => (
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
        onClose={() => setApplyModalOpen(false)}
        title="Apply for Job"
        size="md"
      >
        {applySuccess ? (
          <Stack>
            <Alert color="green">Application submitted successfully!</Alert>
            <Button onClick={() => setApplyModalOpen(false)}>Close</Button>
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
            <Button onClick={handleApply} loading={applySubmitting} fullWidth mt="md">
              Submit Application
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
