import { Accordion, Badge, Button, Checkbox, Group, Modal, Stack, Text } from '@mantine/core';
import { PERMISSION_GROUPS, type PermissionPreset } from '@/api/permissionsApi';

interface Props {
  preset: PermissionPreset | null;
  onClose: () => void;
}

export function PresetViewModal({ preset, onClose }: Props) {
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
          <Accordion multiple defaultValue={PERMISSION_GROUPS.map((g) => g.label)} variant="separated">
            {PERMISSION_GROUPS.map((group) => {
              const visible = group.items.filter((item) => roleKeys.has(item.key));
              if (visible.length === 0) return null;
              return (
                <Accordion.Item key={group.label} value={group.label}>
                  <Accordion.Control>
                    <Group justify="space-between" w="100%" wrap="nowrap" pr="sm">
                      <Text size="sm" fw={500}>
                        {group.label}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {visible.length} enabled
                      </Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={6}>
                      {visible.map((item) => (
                        <Checkbox key={item.key} label={item.label} checked disabled />
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
          <Group justify="flex-end">
            <Button variant="light" onClick={onClose}>
              Close
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
