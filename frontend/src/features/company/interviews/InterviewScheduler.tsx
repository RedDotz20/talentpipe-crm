import { useEffect, useState } from 'react';
import {
  Button,
  Group,
  Input,
  Loader,
  Modal,
  Select,
  Stack,
} from '@mantine/core';
import type { Interview } from '@/api/interviewsApi';
import { useApplications } from '@/features/company/pipeline/hooks/usePipeline';
import { useCompanyUsers } from './hooks/useInterviews';

const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string): string => {
  const [date, time] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
};

export function InterviewScheduler({
  opened,
  onClose,
  submitting,
  onSubmit,
  initial,
}: {
  opened: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (values: {
    interviewId?: string;
    applicationId: string;
    interviewerId: string;
    scheduledAt: string;
  }) => void;
  initial?: Interview | null;
}) {
  const applicationsQuery = useApplications();
  const usersQuery = useCompanyUsers();
  const [applicationId, setApplicationId] = useState('');
  const [interviewerId, setInterviewerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  useEffect(() => {
    if (!opened) return;
    setApplicationId(initial?.applicationId ?? '');
    setInterviewerId(initial?.interviewerId ?? '');
    setScheduledAt(initial?.scheduledAt ? toLocalInput(initial.scheduledAt) : '');
  }, [opened, initial]);

  const applications = applicationsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const canSubmit = !!applicationId && !!interviewerId && !!scheduledAt;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={initial ? 'Reschedule interview' : 'Schedule interview'}
      centered
    >
      <Stack>
        <Select
          label="Application"
          placeholder="Select application"
          data={applications.map((a) => ({
            value: a.id,
            label: `${a.candidateName} — ${a.jobTitle}`,
          }))}
          value={applicationId}
          onChange={(value) => setApplicationId(value ?? '')}
          searchable
          disabled={!!initial}
        />
        <Select
          label="Interviewer"
          placeholder="Select interviewer"
          data={users.map((u) => ({ value: u.id, label: u.email }))}
          value={interviewerId}
          onChange={(value) => setInterviewerId(value ?? '')}
          searchable
          disabled={!!initial}
        />
        <Input.Wrapper label="Scheduled at" required>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.currentTarget.value)}
            disabled={submitting}
          />
        </Input.Wrapper>
        {applicationsQuery.isLoading || usersQuery.isLoading ? (
          <Loader size="sm" />
        ) : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || submitting}
            loading={submitting}
            onClick={() =>
              onSubmit({
                interviewId: initial?.id,
                applicationId,
                interviewerId,
                scheduledAt: fromLocalInput(scheduledAt),
              })
            }
          >
            {initial ? 'Save changes' : 'Schedule'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
