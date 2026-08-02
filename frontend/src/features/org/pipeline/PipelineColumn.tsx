import { useDroppable } from '@dnd-kit/core';
import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { Application } from '@/api/applicationsApi';
import type { PipelineStage } from '@/api/pipelineStagesApi';
import { ApplicationCard } from './ApplicationCard';

interface Props {
  stage: PipelineStage;
  applications: Application[];
  onSelect: (id: string) => void;
}

export function PipelineColumn({ stage, applications, onSelect }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <Card
      ref={setNodeRef}
      w={280}
      withBorder
      style={{
        flexShrink: 0,
        backgroundColor: isOver ? 'var(--mantine-color-gray-0)' : undefined,
        transition: 'background-color 150ms ease',
      }}
    >
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {stage.name}
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {applications.length}
          </Badge>
        </Group>
      </Card.Section>
      <Stack gap="xs" mt="xs">
        {applications.map((app) => (
          <ApplicationCard
            key={app.id}
            application={app}
            onClick={() => onSelect(app.id)}
          />
        ))}
      </Stack>
    </Card>
  );
}
