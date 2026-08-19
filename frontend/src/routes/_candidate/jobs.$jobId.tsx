import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Alert, Container } from '@mantine/core';
import { useApplications, useJobDetail } from '@/features/candidate-account/hooks';
import { JobDetailsView } from '@/features/candidate-account/jobs/JobDetailsView';
import { CandidateApplyModal } from '@/features/candidate-account/applications/CandidateApplyModal';
import { DetailSkeleton } from '@/shared/components/Skeletons';

export const Route = createFileRoute('/_candidate/jobs/$jobId')({
  validateSearch: (search: Record<string, unknown>) => ({
    companyId: typeof search.companyId === 'string' ? search.companyId : '',
    from: typeof search.from === 'string' ? search.from : '',
  }),
  component: CandidateJobDetailRoute,
});

function CandidateJobDetailRoute() {
  const { jobId } = Route.useParams();
  const { companyId, from } = Route.useSearch();
  const fromApplications = from === 'applications';
  const { data: job, isLoading, error } = useJobDetail(companyId, jobId);
  const { data: applicationsResult = { data: [], total: 0 } } = useApplications({ pageSize: 50 });
  const applications = applicationsResult.data;
  const [applyOpened, setApplyOpened] = useState(false);

  if (!companyId) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Job not found">
          This position is no longer available or could not be loaded.
        </Alert>
      </Container>
    );
  }

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
        <Alert color="red" title="Job not found">
          This position is no longer available or could not be loaded.
        </Alert>
      </Container>
    );
  }

  const applied = applications.some(
    (app) =>
      app.companyId === companyId && app.jobPostingId === (job.jobPostingId ?? job.id),
  );

  return (
    <Container size="md" py="xl">
      <JobDetailsView
        job={job}
        backLink={
          fromApplications ? (
            <Link to="/applications">Back to my applications</Link>
          ) : (
            <Link to="/dashboard">Back to job search</Link>
          )
        }
        onApply={() => setApplyOpened(true)}
        applyLabel="Apply now"
        applied={applied}
        showAppliedAction={!fromApplications}
      />
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
