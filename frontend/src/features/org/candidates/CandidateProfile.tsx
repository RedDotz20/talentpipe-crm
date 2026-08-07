import { Anchor, Badge, Group, Loader, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { resumesApi } from '@/api/resumesApi';
import { useCandidate } from './hooks/useCandidates';
import { MatchScoreBadge } from './MatchScoreBadge';

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function CandidateProfile({ candidateId, onClose }: Props) {
  const { data: candidate, isLoading } = useCandidate(candidateId ?? '');
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    if (candidateId && candidate?.resume?.fileUrl) {
      resumesApi
        .download(candidateId)
        .then((u) => {
          url = u;
          setResumeUrl(u);
        })
        .catch(() => setResumeUrl(null));
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [candidateId, candidate?.resume?.fileUrl]);

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

          {candidate.skills && candidate.skills.length > 0 && (
            <Group gap="xs">
              <Text size="sm" fw={500}>Skills:</Text>
              {candidate.skills.map((skill) => (
                <Badge key={skill.id} size="sm" variant="light">
                  {skill.name}
                </Badge>
              ))}
            </Group>
          )}

          <Title order={4} mt="sm">
            Resume
          </Title>
          {candidate.resume ? (
            <Stack gap="xs">
              {candidate.resume.fileUrl ? (
                <Text size="sm">
                  {resumeUrl ? (
                    <Anchor href={resumeUrl} target="_blank">
                      View Resume
                    </Anchor>
                  ) : (
                    <Text span c="dimmed">
                      Loading resume…
                    </Text>
                  )}
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  No file available
                </Text>
              )}
              <Text size="xs" c="dimmed">
                 Uploaded: {candidate.resume.uploadedAt ? new Date(candidate.resume.uploadedAt).toLocaleDateString() : '—'}
              </Text>
            </Stack>
          ) : <Text size="sm" c="dimmed">No resume available.</Text>}

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
