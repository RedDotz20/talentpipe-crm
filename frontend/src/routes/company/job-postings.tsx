import { createFileRoute } from '@tanstack/react-router';
import { useDisclosure } from '@mantine/hooks';
import { JobPostingList } from '../../features/company/job-postings/JobPostingList';
import { JobPostingForm } from '../../features/company/job-postings/JobPostingForm';
import { useCreateJobPosting } from '../../features/company/job-postings/hooks/useJobPostings';

export const Route = createFileRoute('/company/job-postings')({
  component: JobPostingsPage,
});

function JobPostingsPage() {
  const [opened, { open, close }] = useDisclosure(false);
  const create = useCreateJobPosting();

  return (
    <>
      <JobPostingList onCreate={open} />
      <JobPostingForm
        opened={opened}
        onClose={close}
        submitting={create.isPending}
        onSubmit={(values) => create.mutate(values, { onSuccess: close })}
      />
    </>
  );
}
