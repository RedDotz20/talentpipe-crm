import { Alert, Button, Container, Stack } from '@mantine/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuthStore } from '@/api/useAuth';
import { CandidateApplyModal } from '@/features/candidate-portal/applications/CandidateApplyModal';
import { JobDetailsView } from '@/features/candidate-portal/jobs/JobDetailsView';
import { DetailSkeleton } from '@/shared/components/Skeletons';
import { getSafeCareerReturnTo } from '@/features/auth/returnTo';
import { usePublicJob } from './hooks/usePublicCareers';

interface JobDetailPageProps {
  companySlug: string;
  jobId: string;
}

export function JobDetailPage({
  companySlug,
  jobId,
}: JobDetailPageProps) {
  const { data: job, isLoading, error } = usePublicJob(companySlug, jobId);
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuthStore();
  const [applyOpened, setApplyOpened] = useState(false);
  const [candidateRequired, setCandidateRequired] = useState(false);

  const handleApply = () => {
    const returnTo =
      getSafeCareerReturnTo(`/careers/${companySlug}/jobs/${jobId}`) ?? undefined;
    if (!isAuthenticated()) {
      navigate({
        to: '/auth/signin',
        search: returnTo ? { returnTo } : {},
      });
      return;
    }
    if (role === 'Candidate') {
      setCandidateRequired(false);
      setApplyOpened(true);
      return;
    }
    setCandidateRequired(true);
  };

  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <DetailSkeleton lines={8} />
      </Container>
    );
  }

  if (error || !job) {
    return (
      <Container size="md" py="xl">
        <Stack gap="md">
          <Alert color="red" title="Job not found">
            This position is no longer available or could not be loaded.
          </Alert>
          <Button
            onClick={() =>
              navigate({ to: '/careers/$companySlug/jobs', params: { companySlug } })
            }
            variant="light"
          >
            Back to open positions
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {candidateRequired && (
          <Alert color="yellow" title="Candidate account required">
            Sign in with a Candidate account to submit an application.
          </Alert>
        )}
        <JobDetailsView
          job={job}
          backLink={
            <Link to="/careers/$companySlug/jobs" params={{ companySlug }}>
              Back to open positions
            </Link>
          }
          onApply={handleApply}
        />
      </Stack>
      {applyOpened && (
        <CandidateApplyModal
          opened
          onClose={() => setApplyOpened(false)}
          job={job}
        />
      )}
    </Container>
  );
}
