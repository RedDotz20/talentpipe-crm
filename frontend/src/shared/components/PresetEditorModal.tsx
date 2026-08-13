import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
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
  }, [opened]);

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
        <Accordion multiple defaultValue={PERMISSION_GROUPS.map((g) => g.label)} variant="separated">
          {PERMISSION_GROUPS.map((group) => {
            const visible = group.items.filter((item) => roleKeys.includes(item.key));
            if (visible.length === 0) return null;
            const enabledCount = visible.filter((item) => checked.includes(item.key)).length;
            const allChecked = enabledCount === visible.length;
            const someChecked = enabledCount > 0 && !allChecked;
            const toggleGroup = () => {
              setChecked((prev) => {
                const without = prev.filter((k) => !visible.some((i) => i.key === k));
                return allChecked ? without : [...without, ...visible.map((i) => i.key)];
              });
            };
            return (
              <Accordion.Item key={group.label} value={group.label}>
                <Accordion.Control>
                  <Group justify="space-between" w="100%" wrap="nowrap" pr="sm">
                    <Text size="sm" fw={500}>
                      {group.label}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {enabledCount}/{visible.length} enabled
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={6}>
                    <Checkbox
                      label="Select all"
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={toggleGroup}
                    />
                    {visible.map((item) => (
                      <Checkbox
                        key={item.key}
                        label={item.label}
                        checked={checked.includes(item.key)}
                        onChange={() => toggle(item.key)}
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
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
