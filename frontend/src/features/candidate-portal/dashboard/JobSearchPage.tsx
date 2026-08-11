import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconBookmark, IconBookmarkFilled, IconEye, IconSend } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { JobMetaBadges } from '@/shared/components/JobMetaBadges';
import { timeAgo } from '@/shared/utils/timeAgo';
import { CandidateApplyModal } from '../applications/CandidateApplyModal';
import {
  useApplications,
  useAddBookmark,
  useBookmarks,
  useJobs,
  useRemoveBookmark,
} from '../hooks';
import type { Bookmark, Job } from '../types';

export function JobSearchPage() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useJobs();
  const { data: applications = [] } = useApplications();
  const { data: bookmarks = [] } = useBookmarks();
  const { mutate: addBookmark, isPending: isAdding } = useAddBookmark();
  const { mutate: removeBookmark, isPending: isRemoving } = useRemoveBookmark();
  const [applyJob, setApplyJob] = useState<Job | null>(null);

  const bookmarkByJob = useMemo(
    () => new Map(bookmarks.map((bookmark: Bookmark) => [bookmark.jobPostingId, bookmark])),
    [bookmarks],
  );

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

  const appliedKeys = new Set(
    applications.map((app) => `${app.companyId}:${app.jobPostingId}`),
  );
  const isApplied = (job: Job) =>
    appliedKeys.has(`${job.companyId}:${job.jobPostingId ?? job.id}`);

  const toggleBookmark = (job: Job) => {
    const bookmark = bookmarkByJob.get(job.jobPostingId ?? job.id);
    if (bookmark) {
      removeBookmark(bookmark.id);
    } else {
      addBookmark({ companyId: job.companyId, jobPostingId: job.jobPostingId ?? job.id });
    }
  };

  return (
    <Stack>
      <Title order={2}>Job Search</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="lg">
        {jobs.map((job: Job) => {
          const applied = isApplied(job);
          const bookmarked = bookmarkByJob.has(job.jobPostingId ?? job.id);
          return (
            <Card
              key={job.id}
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              h="100%"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
            <Group align="flex-start" justify="space-between" mb="xs">
              <div>
                <Group gap="sm">
                  <Title order={4}>{job.title}</Title>
                </Group>
                <Group gap="xs" mt={2}>
                  <Text size="sm" c="dimmed">{job.companyName}</Text>
                </Group>
                <Group gap="xs" mt={4}>
                  <JobMetaBadges
                    employmentType={job.employmentType}
                    location={job.location}
                    workSetup={job.workSetup}
                  />
                </Group>
                {job.createdAt && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Posted {timeAgo(job.createdAt)}
                  </Text>
                )}
              </div>
              {applied && (
                <Badge variant="light" color="green" size="sm">
                  Applied
                </Badge>
              )}
            </Group>
            <Group justify="space-between" gap="sm" mt="auto" pt="sm" align="center">
              <Tooltip label={bookmarked ? 'Remove bookmark' : 'Bookmark job'}>
                <ActionIcon
                  variant={bookmarked ? 'filled' : 'subtle'}
                  color="indigo"
                  size="lg"
                  loading={isAdding || isRemoving}
                  onClick={() => toggleBookmark(job)}
                  aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark job'}
                >
                  {bookmarked ? <IconBookmarkFilled size="1.1rem" /> : <IconBookmark size="1.1rem" />}
                </ActionIcon>
              </Tooltip>
              <Group gap="sm">
                <Button
                  component={Link}
                  to="/jobs/$jobId"
                  params={{ jobId: job.id }}
                  search={{ companyId: job.companyId }}
                  variant="light"
                  leftSection={<IconEye size="1rem" />}
                >
                  View details
                </Button>
                {applied ? (
                  <Button
                    component={Link}
                    to="/applications"
                    variant="light"
                    color="green"
                  >
                    Applied
                  </Button>
                ) : (
                  <Button
                    onClick={() => setApplyJob(job)}
                    leftSection={<IconSend size="1rem" />}
                  >
                    Apply now
                  </Button>
                )}
              </Group>
            </Group>
          </Card>
        );
      })}
      </SimpleGrid>
      {applyJob && (
        <CandidateApplyModal
          opened
          onClose={() => setApplyJob(null)}
          job={applyJob}
        />
      )}
    </Stack>
  );
}
