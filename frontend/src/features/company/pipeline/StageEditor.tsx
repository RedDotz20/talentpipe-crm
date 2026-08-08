import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import type { PipelineStage } from '@/api/pipelineStagesApi';
import {
  useCreateStage,
  useDeleteStage,
  usePipelineStages,
  useReorderStages,
  useUpdateStageConfig,
} from './hooks/usePipeline';

function SortableStageRow({
  stage,
  onRename,
  onDelete,
}: {
  stage: PipelineStage;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: stage.id });
  const [name, setName] = useState(stage.name);

  useEffect(() => setName(stage.name), [stage.name]);

  return (
    <Group
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      gap="xs"
      wrap="nowrap"
    >
      <ActionIcon variant="subtle" {...attributes} {...listeners}>
        <IconGripVertical size={16} />
      </ActionIcon>
      <TextInput
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== stage.name) onRename(name.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim() && name.trim() !== stage.name) {
            onRename(name.trim());
          }
        }}
        flex={1}
      />
      <Tooltip label="Delete stage">
        <ActionIcon color="red" variant="subtle" onClick={onDelete}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function StageEditor() {
  const { data: stages, isLoading } = usePipelineStages();
  const createStage = useCreateStage();
  const updateStageConfig = useUpdateStageConfig();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = stages ?? [];
    const oldIndex = current.findIndex((s) => s.id === active.id);
    const newIndex = current.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(current, oldIndex, newIndex).map((s, index) => ({
      ...s,
      order: index,
    }));
    reorderStages.mutate(reordered.map(({ id, order }) => ({ id, order })));
  };

  if (isLoading) return <Loader />;

  const handleAdd = () => {
    if (!newName.trim()) return;
    createStage.mutate(newName.trim(), { onSuccess: () => setNewName('') });
  };

  return (
    <Stack>
      <Title order={3}>Pipeline Stages</Title>
      <Text size="sm" c="dimmed">
        Drag to reorder. Deleting a stage with applications is blocked.
      </Text>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={(stages ?? []).map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <Stack gap="xs">
            {(stages ?? []).map((stage) => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                onRename={(name) =>
                  updateStageConfig.mutate({ id: stage.id, input: { name } })
                }
                onDelete={() => deleteStage.mutate(stage.id)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group>
        <TextInput
          placeholder="New stage name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          flex={1}
        />
        <Button onClick={handleAdd} disabled={!newName.trim()}>
          Add stage
        </Button>
      </Group>
    </Stack>
  );
}
