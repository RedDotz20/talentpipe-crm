import { Badge, Group, Loader, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { useCandidate } from './hooks/useCandidates';
import { useResume } from './hooks/useResume';
import { MatchScoreBadge } from './MatchScoreBadge';
import { ResumeUploadInput } from './ResumeUploadInput';

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function CandidateProfile({ candidateId, onClose }: Props) {
  const { data: candidate, isLoading } = useCandidate(candidateId ?? '');
  const { data: resume } = useResume(candidateId ?? '');

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

          <Title order={4} mt="sm">
            Resume
          </Title>
          {resume ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  Matched skills:
                </Text>
                {resume.skills.length > 0 ? (
                  resume.skills.map((skill) => (
                    <Badge key={skill.id} size="sm" variant="light">
                      {skill.name}
                    </Badge>
                  ))
                ) : (
                  <Text size="sm" c="dimmed">
                    No skills detected
                  </Text>
                )}
              </Group>
              {resume.parsedText && (
                <Text size="xs" c="dimmed" lineClamp={4}>
                  {resume.parsedText}
                </Text>
              )}
            </Stack>
          ) : (
            <ResumeUploadInput candidateId={candidate.id} />
          )}

          <Title order={4} mt="sm">
            Applications
          </Title>
          {candidate.applications && candidate.applications.length > 0 ? (
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Stage</Table.Th>
                  <Table.Th>Match</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {candidate.applications.map((app) => (
                  <Table.Tr key={app.id}>
                    <Table.Td>{app.jobTitle}</Table.Td>
                    <Table.Td>{app.stageName ?? '—'}</Table.Td>
                    <Table.Td>
                      <MatchScoreBadge score={app.matchScore} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              No applications yet.
            </Text>
          )}
        </Stack>
      )}
    </Modal>
  );
}
