import { createFileRoute } from '@tanstack/react-router';
import { useDisclosure } from '@mantine/hooks';
import { Button, Group, Modal, Title } from '@mantine/core';
import { useAuthStore } from '../../api/useAuth';
import { PipelineBoard } from '../../features/org/pipeline/PipelineBoard';
import { StageEditor } from '../../features/org/pipeline/StageEditor';

export const Route = createFileRoute('/org/pipeline')({
  component: PipelinePage,
});

function PipelinePage() {
  const [opened, { open, close }] = useDisclosure(false);
  const role = useAuthStore((s) => s.role);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Pipeline</Title>
        {role === 'OrgAdmin' && (
          <Button variant="outline" onClick={open}>
            Manage Stages
          </Button>
        )}
      </Group>
      <PipelineBoard />
      <Modal opened={opened} onClose={close} title="Manage Stages" size="md">
        <StageEditor />
      </Modal>
    </>
  );
}
