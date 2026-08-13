import { useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconBan, IconCircleCheck, IconTrash } from '@tabler/icons-react';

type PendingAction = 'delete' | 'disable' | 'enable' | null;

interface PresetBulkActionsProps {
  selectedCount: number;
  inUseCount: number;
  affectedUsers: number;
  canDisable: boolean;
  canEnable: boolean;
  deleting: boolean;
  disabling: boolean;
  enabling: boolean;
  onDelete: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onClear: () => void;
}

export function PresetBulkActions({
  selectedCount,
  inUseCount,
  affectedUsers,
  canDisable,
  canEnable,
  deleting,
  disabling,
  enabling,
  onDelete,
  onDisable,
  onEnable,
  onClear,
}: PresetBulkActionsProps) {
  const [pending, setPending] = useState<PendingAction>(null);

  if (selectedCount === 0) return null;

  const confirm = () => {
    const action = pending;
    setPending(null);
    if (action === 'delete') onDelete();
    else if (action === 'disable') onDisable();
    else if (action === 'enable') onEnable();
  };

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
        <Group gap="xs">
          <Button
            variant="light"
            color="orange"
            size="compact-sm"
            leftSection={<IconBan size="0.9rem" />}
            disabled={!canDisable}
            loading={disabling}
            onClick={() => setPending('disable')}
          >
            Disable
          </Button>
          <Button
            variant="light"
            color="teal"
            size="compact-sm"
            leftSection={<IconCircleCheck size="0.9rem" />}
            disabled={!canEnable}
            loading={enabling}
            onClick={() => setPending('enable')}
          >
            Enable
          </Button>
          <Button
            color="red"
            variant="light"
            size="compact-sm"
            leftSection={<IconTrash size="0.9rem" />}
            loading={deleting}
            onClick={() => setPending('delete')}
          >
            Delete
          </Button>
        </Group>
      </Group>

      <Modal
        opened={pending !== null}
        onClose={() => setPending(null)}
        title={
          pending === 'delete'
            ? 'Delete presets'
            : pending === 'disable'
              ? 'Disable presets'
              : 'Enable presets'
        }
      >
        <Stack>
          {pending && (
            <>
              <Text size="sm">
                {pending === 'delete' && `Delete ${selectedCount} preset${selectedCount === 1 ? '' : 's'}?`}
                {pending === 'disable' && `Disable ${selectedCount} preset${selectedCount === 1 ? '' : 's'}?`}
                {pending === 'enable' && `Enable ${selectedCount} preset${selectedCount === 1 ? '' : 's'}?`}
              </Text>
              {pending === 'delete' &&
                (inUseCount > 0 ? (
                  <Alert color="red">
                    {inUseCount} of the selected presets are in use and can't be deleted.
                  </Alert>
                ) : (
                  <Alert color="red">This action cannot be undone.</Alert>
                ))}
              {pending === 'disable' &&
                (inUseCount > 0 ? (
                  <Alert color="orange">
                    {inUseCount} of the selected presets are in use: {affectedUsers} user
                    {affectedUsers === 1 ? '' : 's'} will revert to their role default.
                  </Alert>
                ) : (
                  <Alert color="orange">
                    Disabled presets can't be assigned until they're re-enabled.
                  </Alert>
                ))}
              {pending === 'enable' && (
                <Alert color="teal">The presets become assignable again.</Alert>
              )}
              <Group justify="flex-end">
                <Button variant="light" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button
                  color={pending === 'delete' ? 'red' : pending === 'disable' ? 'orange' : 'teal'}
                  loading={deleting || disabling || enabling}
                  onClick={confirm}
                >
                  Confirm
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
