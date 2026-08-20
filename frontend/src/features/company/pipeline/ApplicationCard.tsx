import { useDraggable } from '@dnd-kit/core';
import { Card, Group, Stack, Text } from '@mantine/core';
import type { Application } from '@/api/applicationsApi';
import { MatchScoreBadge } from '@/features/company/candidates/MatchScoreBadge';

function ApplicationCardContent({ application }: { application: Application }) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={600} lineClamp={1}>
        {application.candidateName}
      </Text>
      <Text size="xs" c="dimmed" lineClamp={1}>
        {application.jobTitle}
      </Text>
      <Group justify="space-between" mt={4}>
        <MatchScoreBadge score={application.matchScore ?? null} />
        <Text size="xs" c="dimmed">
          {new Date(application.appliedAt).toLocaleDateString()}
        </Text>
      </Group>
    </Stack>
  );
}

export function ApplicationCard({
  application,
  onClick,
}: {
  application: Application;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application.id,
  });

  return (
    <Card
      ref={setNodeRef}
      withBorder
      onClick={onClick}
      {...attributes}
      {...listeners}
      styles={{
        root: {
          cursor: 'grab',
          opacity: isDragging ? 0 : 1,
          transition: 'box-shadow 150ms ease, transform 150ms ease',
          '&:hover': {
            transform: 'translateY(-2px)',
          },
        },
      }}
    >
      <ApplicationCardContent application={application} />
    </Card>
  );
}

export function ApplicationCardOverlay({
  application,
}: {
  application: Application;
}) {
  return (
    <Card
      withBorder
      styles={{
        root: {
          cursor: 'grabbing',
          width: 'calc(280px - 2 * var(--mantine-spacing-md))',
          transform: 'scale(1.02)',
          boxShadow: 'var(--mantine-shadow-xl)',
        },
      }}
    >
      <ApplicationCardContent application={application} />
    </Card>
  );
}
