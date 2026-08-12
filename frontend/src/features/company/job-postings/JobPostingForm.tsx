import { useEffect } from 'react';
import { Button, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { z } from 'zod';
import { RequiredSkillsPicker } from './RequiredSkillsPicker';
import type { CreateJobPostingInput, JobPosting } from '../../../api/jobPostingsApi';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  employmentType: z.string().min(1, 'Employment type is required'),
  location: z.string().min(1, 'Location is required'),
  workSetup: z.string().min(1, 'Work setup is required'),
  requiredSkillIds: z.array(z.string()).default([]),
});

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'intern'];
const WORK_SETUPS = ['on-site', 'hybrid', 'work-from-home'];

interface Props {
  opened: boolean;
  onClose: () => void;
  submitting: boolean;
  initial?: JobPosting | null;
  onSubmit: (values: CreateJobPostingInput) => void;
}

export function JobPostingForm({ opened, onClose, submitting, initial, onSubmit }: Props) {
  const form = useForm({
    initialValues: {
      title: '',
      description: '',
      employmentType: '',
      location: '',
      workSetup: '',
      requiredSkillIds: [] as string[],
    },
    validate: schemaResolver(schema),
  });

  useEffect(() => {
    if (opened && initial) {
      form.setValues({
        title: initial.title,
        description: initial.description ?? '',
        employmentType: initial.employmentType ?? '',
        location: initial.location ?? '',
        workSetup: initial.workSetup ?? '',
        requiredSkillIds: initial.requiredSkillIds,
      });
    } else if (opened && !initial) {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initial]);

  return (
    <Modal opened={opened} onClose={onClose} title={initial ? 'Edit Job Posting' : 'New Job Posting'}>
      <form
        onSubmit={form.onSubmit((values) => {
          onSubmit({
            title: values.title,
            description: values.description || undefined,
            employmentType: values.employmentType,
            location: values.location,
            workSetup: values.workSetup,
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
          <Select
            label="Employment type"
            placeholder="Full-time"
            required
            data={EMPLOYMENT_TYPES.map((value) => ({
              value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            }))}
            {...form.getInputProps('employmentType')}
          />
          <TextInput
            label="Location"
            placeholder="Makati City"
            required
            {...form.getInputProps('location')}
          />
          <Select
            label="Work setup"
            placeholder="On-site"
            required
            data={WORK_SETUPS.map((value) => ({
              value,
              label: value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            }))}
            {...form.getInputProps('workSetup')}
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
            {initial ? 'Save' : 'Create'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
