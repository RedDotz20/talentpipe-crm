import { Button, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { z } from 'zod';
import { RequiredSkillsPicker } from './RequiredSkillsPicker';
import type { CreateJobPostingInput } from '../../../api/jobPostingsApi';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  requiredSkillIds: z.array(z.string()).default([]),
});

interface Props {
  opened: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (values: CreateJobPostingInput) => void;
}

export function JobPostingForm({ opened, onClose, submitting, onSubmit }: Props) {
  const form = useForm({
    initialValues: { title: '', description: '', requiredSkillIds: [] as string[] },
    validate: schemaResolver(schema),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="New Job Posting">
      <form
        onSubmit={form.onSubmit((values) => {
          onSubmit({
            title: values.title,
            description: values.description || undefined,
            requiredSkillIds: values.requiredSkillIds,
          });
          form.reset();
        })}
      >
        <Stack>
          <TextInput
            label="Title"
            placeholder="Senior Software Engineer"
            required
            {...form.getInputProps('title')}
          />
          <Textarea
            label="Description"
            autosize
            minRows={3}
            {...form.getInputProps('description')}
          />
          <RequiredSkillsPicker
            value={form.values.requiredSkillIds}
            onChange={(v) => form.setFieldValue('requiredSkillIds', v)}
          />
          <Button type="submit" loading={submitting}>
            Create
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
