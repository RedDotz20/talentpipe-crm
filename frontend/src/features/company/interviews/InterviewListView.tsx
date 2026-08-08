import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Table,
  Text,
  Title,
} from '@mantine/core';
import dayjs from 'dayjs';
import { useAuthStore } from '@/api/useAuth';
import type { Interview, InterviewStatus } from '@/api/interviewsApi';
import {
  useInterviews,
  useScheduleInterview,
  useUpdateInterview,
} from './hooks/useInterviews';
import { InterviewScheduler } from './InterviewScheduler';
import { InterviewFeedbackForm } from './InterviewFeedbackForm';

const STATUS_COLOR: Record<InterviewStatus, string> = {
  scheduled: 'blue',
  completed: 'green',
  cancelled: 'red',
};

export function InterviewListView() {
  const role = useAuthStore((s) => s.role);
  const interviewsQuery = useInterviews();
  const schedule = useScheduleInterview();
  const updateInterview = useUpdateInterview();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Interview | null>(null);

  const interviews = interviewsQuery.data ?? [];
  const isInterviewer = role === 'Interviewer';
  const canManage =
    role === 'CompanyAdmin' || role === 'Recruiter' || role === 'HiringManager';

  const handleSubmit = (values: {
    interviewId?: string;
    applicationId: string;
    interviewerId: string;
    scheduledAt: string;
  }) => {
    if (values.interviewId) {
      updateInterview.mutate(
        { id: values.interviewId, input: { scheduledAt: values.scheduledAt } },
        { onSuccess: () => setSchedulerOpen(false) },
      );
    } else {
      schedule.mutate(
        {
          applicationId: values.applicationId,
          interviewerId: values.interviewerId,
          scheduledAt: values.scheduledAt,
        },
        { onSuccess: () => setSchedulerOpen(false) },
      );
    }
  };

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Interviews</Title>
        {canManage ? (
          <Button
            onClick={() => {
              setEditing(null);
              setSchedulerOpen(true);
            }}
          >
            Schedule interview
          </Button>
        ) : null}
      </Group>

      {interviewsQuery.isLoading ? (
        <Loader />
      ) : interviews.length === 0 ? (
        <Text c="dimmed">No interviews yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Candidate</Table.Th>
              <Table.Th>Job</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Interviewer</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {interviews.map((interview) => (
              <Table.Tr key={interview.id}>
                <Table.Td>{interview.candidateName}</Table.Td>
                <Table.Td>{interview.jobTitle}</Table.Td>
                <Table.Td>
                  {dayjs(interview.scheduledAt).format('MMM D, YYYY h:mm A')}
                </Table.Td>
                <Table.Td>{interview.interviewerEmail}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={STATUS_COLOR[interview.status]}>
                    {interview.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {isInterviewer ? (
                    interview.rating !== null ? (
                      <Text size="xs" c="dimmed">
                        Feedback submitted
                      </Text>
                    ) : (
                      <Button
                        size="xs"
                        onClick={() => setFeedbackFor(interview)}
                      >
                        Feedback
                      </Button>
                    )
                  ) : (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                          setEditing(interview);
                          setSchedulerOpen(true);
                        }}
                      >
                        Reschedule
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        disabled={interview.status === 'cancelled'}
                        onClick={() =>
                          updateInterview.mutate({
                            id: interview.id,
                            input: { status: 'cancelled' },
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <InterviewScheduler
        opened={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
        initial={editing}
        submitting={schedule.isPending || updateInterview.isPending}
        onSubmit={handleSubmit}
      />
      <InterviewFeedbackForm
        interview={feedbackFor}
        onClose={() => setFeedbackFor(null)}
      />
    </>
  );
}
