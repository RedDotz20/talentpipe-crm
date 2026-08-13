import { useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';

interface PresetBulkDeleteProps {
  selectedCount: number;
  inUseCount: number;
  affectedUsers: number;
  deleting: boolean;
  onConfirm: () => void;
  onClear: () => void;
}

export function PresetBulkDelete({
  selectedCount,
  inUseCount,
  affectedUsers,
  deleting,
  onConfirm,
  onClear,
}: PresetBulkDeleteProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <>
      <Group
        justify="space-between"
        mb="md"
        p="xs"
        style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 8 }}
      >
        <Group gap="sm">
          <Badge variant="light" color="indigo">
            {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
          </Badge>
          <Button variant="subtle" size="compact-sm" onClick={onClear}>
            Clear
          </Button>
        </Group>
        <Button
          color="red"
          variant="light"
          leftSection={<IconTrash size="1rem" />}
          loading={deleting}
          onClick={() => setConfirmOpen(true)}
        >
          Delete
        </Button>
      </Group>

      <Modal opened={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete presets">
        <Stack>
          <Text size="sm">
            Delete {selectedCount} preset{selectedCount === 1 ? '' : 's'}?
          </Text>
          {inUseCount > 0 ? (
            <Alert color="red">
              {inUseCount} of the selected presets are in use: {affectedUsers} user
              {affectedUsers === 1 ? '' : 's'} will revert to their role default.
            </Alert>
          ) : (
            <Alert color="red">This action cannot be undone.</Alert>
          )}
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleting}
              onClick={() => {
                setConfirmOpen(false);
                onConfirm();
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
