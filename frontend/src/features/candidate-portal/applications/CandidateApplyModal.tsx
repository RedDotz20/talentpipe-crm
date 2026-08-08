import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  MultiSelect,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useApply, useAllSkills, useProfile } from '../hooks';
import type { Job, Skill } from '../types';

interface CandidateApplyModalProps {
  opened: boolean;
  onClose: () => void;
  job: Pick<
    Job,
    'id' | 'jobPostingId' | 'companyId' | 'title' | 'companyName'
  >;
}

export function CandidateApplyModal({
  opened,
  onClose,
  job,
}: CandidateApplyModalProps) {
  const { mutate: apply, isPending: isApplying, reset: resetApply } = useApply();
  const { data: profile } = useProfile();
  const { data: allSkills = [] } = useAllSkills();
  const [phone, setPhone] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!opened) return;
    setPhone(profile?.phone ?? '');
    setCoverLetter('');
    setSkillIds(profile?.skills.map((skill: Skill) => skill.id) ?? []);
    setSuccess(false);
    setError('');
  }, [opened, profile]);

  const close = () => {
    setSuccess(false);
    setError('');
    resetApply();
    onClose();
  };

  const handleApply = () => {
    const jobPostingId = job.jobPostingId ?? job.id;
    apply(
      {
        companyId: job.companyId,
        jobId: jobPostingId,
        data: {
          phone: phone || undefined,
          coverLetter: coverLetter || undefined,
          skillIds: skillIds.length > 0 ? skillIds : undefined,
        },
      },
      {
        onSuccess: () => setSuccess(true),
        onError: () => setError('Failed to submit application'),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={close} title={`Apply for ${job.title}`} size="md">
      {success ? (
        <Stack>
          <Alert color="green">Application submitted successfully!</Alert>
          <Button onClick={close}>Close</Button>
        </Stack>
      ) : (
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <Text size="sm">
            Applying to {job.companyName} as {profile?.firstName} {profile?.lastName}{' '}
            ({profile?.email})
          </Text>
          <TextInput
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
          />
          <Textarea
            label="Cover letter"
            minRows={4}
            value={coverLetter}
            onChange={(event) => setCoverLetter(event.currentTarget.value)}
          />
          <MultiSelect
            label="Skills"
            placeholder="Select or search skills"
            data={allSkills.map((skill: Skill) => ({
              label: skill.name,
              value: skill.id,
            }))}
            value={skillIds}
            onChange={setSkillIds}
            searchable
            clearable
          />
          <Button onClick={handleApply} loading={isApplying} fullWidth mt="md">
            Submit application
          </Button>
        </Stack>
      )}
    </Modal>
  );
}
