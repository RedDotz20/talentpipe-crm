import { Badge, Button, Group, Modal, Stack, Switch, Text } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { PERMISSION_GROUPS, type PermissionPreset } from '@/api/permissionsApi';

interface Props {
  preset: PermissionPreset | null;
  onClose: () => void;
  onDuplicate: () => void;
}

export function PresetViewModal({ preset, onClose, onDuplicate }: Props) {
  const roleKeys = preset ? new Set(preset.permissions) : new Set<string>();
  return (
    <Modal opened={preset !== null} onClose={onClose} title={preset?.name ?? ''} size="lg">
      {preset && (
        <Stack>
          <Group gap="xs">
            <Badge variant="light" color="gray">
              {preset.isDefault ? 'Locked - role default' : 'Locked - shared preset'}
            </Badge>
            <Badge variant="light" color="indigo">
              {preset.role}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {preset.isDefault
              ? 'Default presets are read-only. Duplicate to create your own editable copy.'
              : 'Shared presets are read-only here. Duplicate to create your own editable copy.'}
          </Text>
          {PERMISSION_GROUPS.map((group) => {
            const visible = group.keys.filter((k) => roleKeys.has(k));
            if (visible.length === 0) return null;
            return (
              <Stack key={group.label} gap={6}>
                <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                  {group.label}
                </Text>
                {visible.map((key) => (
                  <Switch key={key} label={key} checked disabled />
                ))}
              </Stack>
            );
          })}
          <Group justify="flex-end">
            <Button variant="light" onClick={onClose}>
              Close
            </Button>
            <Button
              leftSection={<IconCopy size="1rem" />}
              onClick={() => {
                onClose();
                onDuplicate();
              }}
            >
              Duplicate
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
