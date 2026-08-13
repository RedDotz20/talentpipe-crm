import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { PERMISSION_GROUPS, ROLE_PERMISSIONS } from '@/api/permissionsApi';

export interface PresetEditorValue {
  name: string;
  role: string;
  permissions: string[];
}

interface Props {
  opened: boolean;
  title: string;
  initial: PresetEditorValue | null;
  roleLocked: boolean;
  onClose: () => void;
  onSave: (value: PresetEditorValue) => void;
  saving: boolean;
}

export function PresetEditorModal({
  opened,
  title,
  initial,
  roleLocked,
  onClose,
  onSave,
  saving,
}: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Recruiter');
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    if (!opened) return;
    setName(initial?.name ?? '');
    setRole(initial?.role ?? 'Recruiter');
    setChecked(initial ? initial.permissions : ROLE_PERMISSIONS['Recruiter']);
  }, [opened, initial]);

  const roleKeys = useMemo(() => ROLE_PERMISSIONS[role] ?? [], [role]);

  const toggle = (key: string) => {
    setChecked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <Stack>
        <TextInput
          label="Preset name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Role
          </Text>
          <select
            value={role}
            disabled={roleLocked}
            onChange={(e) => {
              setRole(e.currentTarget.value);
              setChecked(ROLE_PERMISSIONS[e.currentTarget.value] ?? []);
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--mantine-color-default-border)',
              background: 'var(--mantine-color-default)',
            }}
          >
            {Object.keys(ROLE_PERMISSIONS).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {PERMISSION_GROUPS.map((group) => {
          const visible = group.keys.filter((k) => roleKeys.includes(k));
          if (visible.length === 0) return null;
          return (
            <Stack key={group.label} gap={6}>
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {group.label}
              </Text>
              {visible.map((key) => (
                <Switch
                  key={key}
                  label={key}
                  checked={checked.includes(key)}
                  onChange={() => toggle(key)}
                />
              ))}
            </Stack>
          );
        })}
        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), role, permissions: checked })}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
