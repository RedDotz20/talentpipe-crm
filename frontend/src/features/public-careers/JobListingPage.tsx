import { useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Container,
  Group,
  Pagination,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { JobMetaBadges } from '@/shared/components/JobMetaBadges';
import { CardGridSkeleton } from '@/shared/components/Skeletons';
import { ListControls } from '@/shared/components/ListControls';
import { useListQuery } from '@/shared/hooks/useListQuery';
import { usePublicJobs } from './hooks/usePublicCareers';

interface JobListingPageProps {
  companySlug: string;
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
          <CardGridSkeleton count={3} cols={{ base: 1, sm: 1, xl: 1 }} />
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
          jobs.map((job) => (
            <Card key={job.id} withBorder padding="lg" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Title order={3}>{job.title}</Title>
                    <Text c="dimmed" size="sm">
                      {job.companyName}
                    </Text>
                    <JobMetaBadges
                      employmentType={job.employmentType}
                      location={job.location}
                      workSetup={job.workSetup}
                    />
                  </div>
                  <Badge color="green">Open</Badge>
                </Group>
                <Text lineClamp={3}>{job.description ?? 'No description provided.'}</Text>
                <Link
                  to="/careers/$companySlug/jobs/$jobId"
                  params={{ companySlug, jobId: job.id }}
                >
                  View job details
                </Link>
              </Stack>
            </Card>
          ))
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
