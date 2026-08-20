import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useDisclosure } from '@mantine/hooks';
import { JobPostingList } from '@/features/company/job-postings/JobPostingList';
import { JobPostingForm } from '@/features/company/job-postings/JobPostingForm';
import {
  useCreateJobPosting,
  useJobPosting,
  useUpdateJobPosting,
} from '@/features/company/job-postings/hooks/useJobPostings';
import type { JobPosting } from '@/api/jobPostingsApi';

export const Route = createFileRoute('/company/job-postings')({
  component: JobPostingsPage,
});

function JobPostingsPage() {
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const create = useCreateJobPosting();
  const update = useUpdateJobPosting();
  const { data: detail } = useJobPosting(editing?.id ?? '');

  return (
    <>
      <JobPostingList
        onCreate={open}
        onEdit={(jp) => {
          setEditing(jp);
          open();
        }}
      />
      <JobPostingForm
        opened={opened}
        onClose={() => {
          close();
          setEditing(null);
        }}
        submitting={create.isPending || update.isPending}
        initial={editing ? detail : null}
        onSubmit={(values) => {
          if (editing) {
            update.mutate(
              { id: editing.id, input: values },
              {
                onSuccess: () => {
                  close();
                  setEditing(null);
                },
              },
            );
          } else {
            create.mutate(values, { onSuccess: close });
          }
        }}
      />
    </>
  );
}
