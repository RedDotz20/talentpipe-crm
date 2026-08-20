import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Pagination,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { JobMetaBadges } from '@/shared/components/JobMetaBadges';
import { CardGridSkeleton } from '@/shared/components/Skeletons';
import { ListControls } from '@/shared/components/ListControls';
import { useListQuery } from '@/shared/hooks/useListQuery';
import { timeAgo } from '@/shared/utils/timeAgo';
import { usePublicJobs } from './hooks/usePublicCareers';

interface JobListingPageProps {
  companySlug?: string;
}

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'intern'];
const WORK_SETUPS = ['on-site', 'hybrid', 'work-from-home'];

export function JobListingPage({ companySlug }: JobListingPageProps) {
  const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' });
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string | null>(null);
  const [workSetupFilter, setWorkSetupFilter] = useState<string | null>(null);
  const {
    data: result = { data: [], total: 0 },
    isLoading,
    error,
  } = usePublicJobs(companySlug, {
    ...listQuery.params,
    employmentType: employmentTypeFilter ?? undefined,
    workSetup: workSetupFilter ?? undefined,
  });
  const jobs = result.data;

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <Stack gap="lg">
          <div>
            <Title order={1}>Open positions</Title>
            <Text c="dimmed" mt="xs">
              Explore the latest opportunities and find your next role.
            </Text>
          </div>
          <CardGridSkeleton count={6} cols={{ base: 1, sm: 2, xl: 3 }} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Unable to load jobs">
          The careers page could not be loaded. Please try again later.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1}>Open positions</Title>
          <Text c="dimmed" mt="xs">
            Explore the latest opportunities and find your next role.
          </Text>
        </div>

        <ListControls
          searchPlaceholder="Search job title"
          searchValue={listQuery.search}
          onSearchChange={(value) => {
            listQuery.setSearch(value);
            listQuery.setPage(1);
          }}
          filters={[
            {
              key: 'employmentType',
              placeholder: 'Employment type',
              data: EMPLOYMENT_TYPES.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              })),
              value: employmentTypeFilter,
              onChange: (value) => {
                setEmploymentTypeFilter(value);
                listQuery.setPage(1);
              },
            },
            {
              key: 'workSetup',
              placeholder: 'Work setup',
              data: WORK_SETUPS.map((value) => ({
                value,
                label: value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              })),
              value: workSetupFilter,
              onChange: (value) => {
                setWorkSetupFilter(value);
                listQuery.setPage(1);
              },
            },
          ]}
          sortOptions={[
            { value: 'createdAt', label: 'Date posted' },
            { value: 'title', label: 'Title' },
          ]}
          sortBy={listQuery.sortBy}
          onSortByChange={(value) => {
            listQuery.setSortBy(value);
            listQuery.setPage(1);
          }}
          sortDir={listQuery.sortDir}
          onToggleSortDir={listQuery.toggleSortDir}
        />

        {jobs.length === 0 ? (
          <Alert color="blue">There are no open positions matching your filters.</Alert>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="lg">
            {jobs.map((job) => (
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
                      <Text size="sm" c="dimmed">
                        {job.companyName}
                      </Text>
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
                </Group>
                <Group justify="flex-end" gap="sm" mt="auto" pt="sm">
                  <Button
                    component={Link}
                    to="/careers/$companySlug/jobs/$jobId"
                    params={{ companySlug: job.companySlug, jobId: job.id }}
                    variant="light"
                    leftSection={<IconEye size="1rem" />}
                  >
                    View job details
                  </Button>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}
        <Group justify="center">
          <Pagination
            total={Math.max(1, Math.ceil(result.total / 10))}
            value={listQuery.page}
            onChange={listQuery.setPage}
            size="sm"
          />
        </Group>
      </Stack>
    </Container>
  );
}
