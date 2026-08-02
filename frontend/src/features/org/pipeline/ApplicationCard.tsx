import { useDraggable } from '@dnd-kit/core';
import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { Application } from '@/api/applicationsApi';

function matchColor(score: number | null): string {
  if (score === null) return 'gray';
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'yellow';
  return 'red';
}

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

  const score = application.matchScore;

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
          {score !== null && score !== undefined ? (
            <Badge size="xs" color={matchColor(score)} variant="light">
              {Math.round(score * 100)}%
            </Badge>
          ) : (
            <Badge size="xs" color="gray" variant="light">
              —
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {new Date(application.appliedAt).toLocaleDateString()}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
