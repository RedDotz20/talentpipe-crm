import { Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { useCandidate } from './hooks/useCandidates';

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function CandidateProfile({ candidateId, onClose }: Props) {
  const { data: candidate, isLoading } = useCandidate(candidateId ?? '');

  return (
    <Modal opened={!!candidateId} onClose={onClose} title="Candidate Profile">
      {isLoading || !candidate ? (
        <Loader />
      ) : (
        <Stack>
          <Title order={3}>{candidate.name}</Title>
          <Text>Email: {candidate.email ?? '—'}</Text>
          <Text>Phone: {candidate.phone ?? '—'}</Text>
          <Text>Added: {new Date(candidate.createdAt).toLocaleDateString()}</Text>
          <Text c="dimmed" size="sm">
            Applications and resume will appear here in a later phase.
          </Text>
        </Stack>
      )}
    </Modal>
  );
}
