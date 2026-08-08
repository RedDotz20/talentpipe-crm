import { useDraggable } from '@dnd-kit/core';
import { Card, Group, Stack, Text } from '@mantine/core';
import type { Application } from '@/api/applicationsApi';
import { MatchScoreBadge } from '../candidates/MatchScoreBadge';

export function ApplicationCard({
  application,
  onClick,
}: {
  application: Application;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: application.id,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.6 : 1,
        cursor: 'grab',
      }
    : { cursor: 'grab' };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      withBorder
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
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
    </Card>
  );
}
