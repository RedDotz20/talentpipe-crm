import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Pagination,
  Table,
  Text,
  Title,
} from '@mantine/core';
import dayjs from 'dayjs';
import { useAuthStore } from '@/api/useAuth';
import type { Interview, InterviewStatus } from '@/api/interviewsApi';
import { ListControls } from '@/shared/components/ListControls';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { TableAction } from '@/shared/components/TableAction';
import { IconBan, IconCalendarClock, IconStar } from '@tabler/icons-react';
import { useListQuery } from '@/shared/hooks/useListQuery';
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
  const listQuery = useListQuery({ sortBy: 'scheduledAt', sortDir: 'asc' });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const interviewsQuery = useInterviews({
    ...listQuery.params,
    status: statusFilter ?? undefined,
  });
  const schedule = useScheduleInterview();
  const updateInterview = useUpdateInterview();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Interview | null>(null);

  const interviews = interviewsQuery.data?.data ?? [];
  const total = interviewsQuery.data?.total ?? 0;
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

      <ListControls
        searchPlaceholder="Search candidate or job"
        searchValue={listQuery.search}
        onSearchChange={(value) => {
          listQuery.setSearch(value);
          listQuery.setPage(1);
        }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            data: [
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
            value: statusFilter,
            onChange: (value) => {
              setStatusFilter(value);
              listQuery.setPage(1);
            },
          },
        ]}
        sortOptions={[
          { value: 'scheduledAt', label: 'Date' },
          { value: 'candidateName', label: 'Candidate' },
        ]}
        sortBy={listQuery.sortBy}
        onSortByChange={(value) => {
          listQuery.setSortBy(value);
          listQuery.setPage(1);
        }}
        sortDir={listQuery.sortDir}
        onToggleSortDir={listQuery.toggleSortDir}
      />
      {interviewsQuery.isLoading ? (
        <TableSkeleton headers={['Candidate', 'Job', 'Date', 'Interviewer', 'Status', 'Actions']} />
      ) : interviews.length === 0 ? (
        <Text c="dimmed">No interviews match your filters.</Text>
      ) : (
        <>
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
                      <TableAction
                        label="Feedback"
                        onClick={() => setFeedbackFor(interview)}
                      >
                        <IconStar size="1rem" />
                      </TableAction>
                    )
                  ) : (
                    <Group gap="xs">
                      <TableAction
                        label="Reschedule"
                        onClick={() => {
                          setEditing(interview);
                          setSchedulerOpen(true);
                        }}
                      >
                        <IconCalendarClock size="1rem" />
                      </TableAction>
                      <TableAction
                        label="Cancel"
                        color="red"
                        disabled={interview.status === 'cancelled'}
                        onClick={() =>
                          updateInterview.mutate({
                            id: interview.id,
                            input: { status: 'cancelled' },
                          })
                        }
                      >
                        <IconBan size="1rem" />
                      </TableAction>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
          <Group justify="center" mt="md">
            <Pagination
              total={Math.max(1, Math.ceil(total / 10))}
              value={listQuery.page}
              onChange={listQuery.setPage}
              size="sm"
            />
          </Group>
        </>
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
