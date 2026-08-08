import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Textarea,
} from '@mantine/core';
import dayjs from 'dayjs';
import type { Application } from '@/api/applicationsApi';
import { useAddNote, useNotes } from './hooks/usePipeline';
import { useInterviews } from '../interviews/hooks/useInterviews';

export function ApplicationDetailDrawer({
  application,
  onClose,
}: {
  application: Application | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const notesQuery = useNotes(application?.id ?? '');
  const addNote = useAddNote(application?.id ?? '');
  const interviewsQuery = useInterviews();

  if (!application) return null;

  const notes = notesQuery.data ?? [];
  const interviews =
    interviewsQuery.data?.filter((i) => i.applicationId === application.id) ??
    [];

  return (
    <Drawer
      opened={!!application}
      onClose={onClose}
      title={`${application.candidateName} — ${application.jobTitle}`}
      position="right"
      size="md"
    >
      <Stack gap="md">
        <Group>
          <Badge variant="light" color={application.stageName ? 'blue' : 'gray'}>
            {application.stageName ?? 'No stage'}
          </Badge>
          {application.matchScore !== null &&
          application.matchScore !== undefined ? (
            <Badge variant="light" color="teal">
              Match {Math.round(application.matchScore * 100)}%
            </Badge>
          ) : null}
        </Group>
        <Text size="sm" c="dimmed">
          Applied{' '}
          {application.appliedAt
            ? dayjs(application.appliedAt).format('MMM D, YYYY')
            : '—'}
        </Text>

        <Tabs defaultValue="notes">
          <Tabs.List>
            <Tabs.Tab value="notes">Notes</Tabs.Tab>
            <Tabs.Tab value="interviews">Interviews</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="notes" pt="md">
            <Stack gap="xs">
              {notesQuery.isLoading ? (
                <Loader size="sm" />
              ) : notes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No notes yet.
                </Text>
              ) : (
                notes.map((n) => (
                  <Box
                    key={n.id}
                    p="xs"
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 8,
                    }}
                  >
                    <Text size="sm">{n.content}</Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {dayjs(n.createdAt).format('MMM D, YYYY h:mm A')}
                    </Text>
                  </Box>
                ))
              )}
              <Textarea
                placeholder="Add a note…"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                minRows={2}
              />
              <Button
                size="xs"
                disabled={note.trim().length === 0 || addNote.isPending}
                onClick={() => {
                  addNote.mutate(note.trim(), { onSuccess: () => setNote('') });
                }}
              >
                Add note
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="interviews" pt="md">
            <Stack gap="xs">
              {interviewsQuery.isLoading ? (
                <Loader size="sm" />
              ) : interviews.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No interviews scheduled yet.
                </Text>
              ) : (
                interviews.map((interview) => (
                  <Box
                    key={interview.id}
                    p="xs"
                    style={{
                      border: '1px solid var(--mantine-color-gray-3)',
                      borderRadius: 8,
                    }}
                  >
                    <Text size="sm">
                      {dayjs(interview.scheduledAt).format(
                        'MMM D, YYYY h:mm A',
                      )}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {interview.interviewerEmail} · {interview.status}
                      {interview.rating !== null
                        ? ` · Rating ${interview.rating}/5`
                        : ''}
                    </Text>
                  </Box>
                ))
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Drawer>
  );
}
