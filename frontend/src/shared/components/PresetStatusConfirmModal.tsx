import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { PermissionPreset } from '@/api/permissionsApi';

interface Props {
  preset: PermissionPreset | null;
  disabling: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function PresetStatusConfirmModal({ preset, disabling, onConfirm, onClose }: Props) {
  return (
    <Modal opened={preset !== null} onClose={onClose} title="Disable preset">
      {preset && (
        <Stack>
          <Text size="sm">Disable {preset.name}?</Text>
          {preset.usageCount > 0 ? (
            <Alert color="orange">
              {preset.usageCount} user{preset.usageCount === 1 ? '' : 's'} will revert to their
              role default.
            </Alert>
          ) : (
            <Alert color="orange">Disabled presets can't be assigned until they're re-enabled.</Alert>
          )}
          <Group justify="flex-end">
            <Button variant="light" onClick={onClose}>
              Cancel
            </Button>
            <Button color="orange" loading={disabling} onClick={onConfirm}>
              Disable
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
