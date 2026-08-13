import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconEye, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import type { PermissionPreset } from '@/api/permissionsApi';
import { PresetViewModal } from '@/shared/components/PresetViewModal';
import { TableAction } from '@/shared/components/TableAction';
import { TableSkeleton } from '@/shared/components/Skeletons';
import {
  PresetEditorModal,
  type PresetEditorValue,
} from '@/shared/components/PresetEditorModal';
import {
  useCompanyPermissionPresets,
  useCreatePreset,
  useDeletePreset,
  useUpdatePreset,
} from './hooks/useCompanyPermissions';

export function PermissionPresetsPage() {
  const presetsQuery = useCompanyPermissionPresets();
  const createPreset = useCreatePreset();
  const updatePreset = useUpdatePreset();
  const deletePreset = useDeletePreset();

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    preset: PermissionPreset | null;
  } | null>(null);
  const [viewing, setViewing] = useState<PermissionPreset | null>(null);

  const presets = presetsQuery.data?.presets ?? [];
  const anySaving = createPreset.isPending || updatePreset.isPending;

  const openCreate = () => setEditor({ mode: 'create', preset: null });
  const openDuplicate = (preset: PermissionPreset) =>
    setEditor({ mode: 'duplicate', preset });
  const openEdit = (preset: PermissionPreset) =>
    setEditor({ mode: 'edit', preset });

  const handleSave = (value: PresetEditorValue) => {
    if (!editor) return;
    if (editor.mode === 'edit' && editor.preset) {
      updatePreset.mutate(
        { id: editor.preset.id, body: { name: value.name, permissions: value.permissions } },
        { onSuccess: () => setEditor(null) },
      );
    } else {
      createPreset.mutate(value, { onSuccess: () => setEditor(null) });
    }
  };

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>Permission presets</Title>
          <Text size="sm" c="dimmed">
            Default presets are read-only. Duplicate one to customize; custom presets
            are scoped to this company.
          </Text>
        </div>
        <Button leftSection={<IconPlus size="1rem" />} onClick={openCreate}>
          Create preset
        </Button>
      </Group>

      {presetsQuery.isLoading ? (
        <TableSkeleton headers={['Name', 'Role', 'Permissions', 'In use', 'Actions']} />
      ) : presets.length === 0 ? (
        <Text c="dimmed">No presets yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Permissions</Table.Th>
              <Table.Th>In use</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {presets.map((preset) => (
              <Table.Tr key={preset.id}>
                <Table.Td>
                  {preset.name}
                  {preset.isDefault && (
                    <Badge size="xs" variant="light" color="gray" ml="xs">
                      default
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{preset.role}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {preset.permissions.length === 0
                      ? 'No permissions'
                      : preset.permissions.join(', ')}
                  </Text>
                </Table.Td>
                <Table.Td>{preset.usageCount}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {(preset.isDefault || preset.isGlobal) && (
                      <TableAction label="View" color="gray" onClick={() => setViewing(preset)}>
                        <IconEye size="1rem" />
                      </TableAction>
                    )}
                    <TableAction
                      label="Duplicate"
                      color="blue"
                      onClick={() => openDuplicate(preset)}
                    >
                      <IconCopy size="1rem" />
                    </TableAction>
                    {!preset.isDefault && !preset.isGlobal && (
                      <>
                        <TableAction label="Edit" onClick={() => openEdit(preset)}>
                          <IconPencil size="1rem" />
                        </TableAction>
                        <Tooltip
                          label="Reassign users before deleting"
                          disabled={preset.usageCount === 0}
                        >
                          <span>
                            <TableAction
                              label="Delete"
                              color="red"
                              disabled={preset.usageCount > 0}
                              loading={deletePreset.isPending}
                              onClick={() => deletePreset.mutate(preset.id)}
                            >
                              <IconTrash size="1rem" />
                            </TableAction>
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <PresetEditorModal
        opened={editor !== null}
        title={
          editor?.mode === 'edit'
            ? 'Edit preset'
            : editor?.mode === 'duplicate'
              ? 'Duplicate preset'
              : 'Create preset'
        }
        initial={
          editor?.preset
            ? {
                name:
                  editor.mode === 'duplicate'
                    ? `${editor.preset.name} (copy)`
                    : editor.preset.name,
                role: editor.preset.role,
                permissions: editor.preset.permissions,
              }
            : null
        }
        roleLocked={editor?.mode === 'edit'}
        onClose={() => setEditor(null)}
        onSave={handleSave}
        saving={anySaving}
      />

      <PresetViewModal
        preset={viewing}
        onClose={() => setViewing(null)}
        onDuplicate={() => openDuplicate(viewing!)}
      />
    </>
  );
}
