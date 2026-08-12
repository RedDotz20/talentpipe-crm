import { useState } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Group, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { BoardSkeleton } from '@/shared/components/Skeletons';
import {
  useApplications,
  usePipelineStages,
  useUpdateStage,
} from './hooks/usePipeline';
import { PipelineColumn } from './PipelineColumn';
import { ApplicationDetailDrawer } from './ApplicationDetailDrawer';

export function PipelineBoard() {
  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const { data: applications, isLoading: appsLoading } = useApplications(
    debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined,
  );
  const updateStage = useUpdateStage();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const appId = String(active.id);
    const app = applications?.find((a) => a.id === appId);
    if (!app) return;
    const overApp = applications?.find((a) => a.id === String(over.id));
    const stageId = overApp ? overApp.currentStageId : String(over.id);
    if (!stageId || app.currentStageId === stageId) return;
    updateStage.mutate({ applicationId: appId, stageId });
  };

  if (stagesLoading || appsLoading) {
    return (
      <>
        <Group mb="md">
          <TextInput
            placeholder="Search candidates or jobs"
            disabled
            leftSection={<IconSearch size="1rem" />}
            style={{ minWidth: 240 }}
          />
        </Group>
        <BoardSkeleton />
      </>
    );
  }

  const selected = applications?.find((a) => a.id === selectedId) ?? null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <Group mb="md">
        <TextInput
          placeholder="Search candidates or jobs"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          leftSection={<IconSearch size="1rem" />}
          style={{ minWidth: 240 }}
        />
      </Group>
      <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
        {(stages ?? []).map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            applications={(applications ?? []).filter(
              (a) => a.currentStageId === stage.id,
            )}
            onSelect={setSelectedId}
          />
        ))}
      </Group>
      <ApplicationDetailDrawer
        application={selected}
        onClose={() => setSelectedId(null)}
      />
    </DndContext>
  );
}
