import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconBan,
  IconCircleCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconLayoutGrid,
  IconPencil,
  IconPlus,
  IconTable,
  IconTrash,
} from '@tabler/icons-react';
import type { PermissionPreset } from '@/api/permissionsApi';
import { PresetCards, PresetCardSkeleton } from '@/shared/components/PresetCards';
import { PresetBulkActions } from '@/shared/components/PresetBulkActions';
import { PresetStatusConfirmModal } from '@/shared/components/PresetStatusConfirmModal';
import { PresetViewModal } from '@/shared/components/PresetViewModal';
import { TableAction } from '@/shared/components/TableAction';
import { TableSkeleton } from '@/shared/components/Skeletons';
import {
  PresetEditorModal,
  type PresetEditorValue,
} from '@/shared/components/PresetEditorModal';
import {
  useBulkDeletePreset,
  useBulkSetPresetEnabled,
  useCompanyPermissionPresets,
  useCreatePreset,
  useDeletePreset,
  useSetPresetEnabled,
  useUpdatePreset,
} from './hooks/useCompanyPermissions';

export function PermissionPresetsPage() {
  const presetsQuery = useCompanyPermissionPresets();
  const createPreset = useCreatePreset();
  const updatePreset = useUpdatePreset();
  const deletePreset = useDeletePreset();
  const setPresetEnabled = useSetPresetEnabled();
  const bulkSetEnabled = useBulkSetPresetEnabled();

  const [disablingPreset, setDisablingPreset] = useState<PermissionPreset | null>(null);

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    preset: PermissionPreset | null;
  } | null>(null);
  const [viewing, setViewing] = useState<PermissionPreset | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() =>
    localStorage.getItem('presetViewMode') === 'table' ? 'table' : 'cards',
  );
  const changeViewMode = (mode: string | null) => {
    const next = mode === 'table' ? 'table' : 'cards';
    setViewMode(next);
    localStorage.setItem('presetViewMode', next);
  };

  const presets = presetsQuery.data?.presets ?? [];
  const anySaving = createPreset.isPending || updatePreset.isPending;

  const [showDefaults, setShowDefaults] = useState(
    () => localStorage.getItem('presetShowDefaults') === 'show',
  );
  const toggleDefaults = () => {
    setShowDefaults((v) => {
      const next = !v;
      localStorage.setItem('presetShowDefaults', next ? 'show' : 'hide');
      return next;
    });
  };
  const visiblePresets = showDefaults
    ? presets
    : presets.filter((p) => !p.isDefault);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const bulkDelete = useBulkDeletePreset();
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const clearSelection = () => setSelectedIds([]);
  const selectedPresets = presets.filter((p) => selectedIds.includes(p.id));
  const inUseCount = selectedPresets.filter((p) => p.usageCount > 0).length;
  const affectedUsers = selectedPresets.reduce((sum, p) => sum + p.usageCount, 0);
  const canDisable = selectedPresets.some((p) => p.isEnabled !== false);
  const canEnable = selectedPresets.some((p) => p.isEnabled === false);
  const confirmBulkDelete = () => {
    bulkDelete.mutate(selectedPresets.map((p) => p.id), { onSuccess: clearSelection });
  };
  const confirmBulkDisable = () => {
    bulkSetEnabled.mutate(
      { ids: selectedPresets.filter((p) => p.isEnabled !== false).map((p) => p.id), enabled: false },
      { onSuccess: clearSelection },
    );
  };
  const confirmBulkEnable = () => {
    bulkSetEnabled.mutate(
      { ids: selectedPresets.filter((p) => p.isEnabled === false).map((p) => p.id), enabled: true },
      { onSuccess: clearSelection },
    );
  };
  const confirmDisablePreset = () => {
    if (disablingPreset) {
      setPresetEnabled.mutate(
        { id: disablingPreset.id, enabled: false },
        { onSuccess: () => setDisablingPreset(null) },
      );
    }
  };
  const enablePreset = (preset: PermissionPreset) =>
    setPresetEnabled.mutate({ id: preset.id, enabled: true });

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
        <Group gap="xs">
          <TableAction
            label={showDefaults ? 'Hide defaults' : 'Show defaults'}
            color="gray"
            onClick={toggleDefaults}
          >
            {showDefaults ? <IconEyeOff size="1rem" /> : <IconEye size="1rem" />}
          </TableAction>
          <SegmentedControl
            size="xs"
            value={viewMode}
            onChange={changeViewMode}
            data={[
              { value: 'cards', label: <Group gap={6}><IconLayoutGrid size="0.9rem" />Cards</Group> },
              { value: 'table', label: <Group gap={6}><IconTable size="0.9rem" />Table</Group> },
            ]}
          />
          <Button leftSection={<IconPlus size="1rem" />} onClick={openCreate}>
            Create preset
          </Button>
        </Group>
      </Group>

      <PresetBulkActions
        selectedCount={selectedPresets.length}
        inUseCount={inUseCount}
        affectedUsers={affectedUsers}
        canDisable={canDisable}
        canEnable={canEnable}
        deleting={bulkDelete.isPending}
        disabling={bulkSetEnabled.isPending}
        enabling={bulkSetEnabled.isPending}
        onDelete={confirmBulkDelete}
        onDisable={confirmBulkDisable}
        onEnable={confirmBulkEnable}
        onClear={clearSelection}
      />

      {presetsQuery.isLoading ? (
        viewMode === 'cards' ? (
          <PresetCardSkeleton />
        ) : (
          <TableSkeleton headers={['Name', 'Role', 'Permissions', 'In use', 'Actions']} />
        )
      ) : presets.length === 0 ? (
        <Text c="dimmed">No presets yet.</Text>
      ) : visiblePresets.length === 0 ? (
        <Text c="dimmed">Defaults are hidden. Click the eye icon to show them.</Text>
      ) : viewMode === 'cards' ? (
        <PresetCards
          presets={visiblePresets}
          locked={(p) => Boolean(p.isDefault || p.isGlobal)}
          onView={setViewing}
          onDuplicate={openDuplicate}
          onEdit={openEdit}
          onDelete={(p) => deletePreset.mutate(p.id)}
          onEnable={enablePreset}
          onDisable={setDisablingPreset}
          deleting={deletePreset.isPending}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>Name</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Permissions</Table.Th>
              <Table.Th>In use</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visiblePresets.map((preset) => (
              <Table.Tr
                key={preset.id}
                onClick={() => setViewing(preset)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  {!preset.isDefault && !preset.isGlobal && (
                    <Checkbox
                      checked={selectedIds.includes(preset.id)}
                      onChange={() => toggleSelect(preset.id)}
                      aria-label={`Select ${preset.name}`}
                      size="sm"
                    />
                  )}
                </Table.Td>
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
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <Group gap="xs">
                    <TableAction label="View" color="gray" onClick={() => setViewing(preset)}>
                      <IconEye size="1rem" />
                    </TableAction>
                    <TableAction
                      label="Duplicate"
                      color="blue"
                      onClick={() => openDuplicate(preset)}
                    >
                      <IconCopy size="1rem" />
                    </TableAction>
                    {!preset.isDefault && !preset.isGlobal && (
                      <>
                        {preset.isEnabled === false ? (
                          <TableAction label="Enable" color="teal" onClick={() => enablePreset(preset)}>
                            <IconCircleCheck size="1rem" />
                          </TableAction>
                        ) : (
                          <TableAction label="Disable" color="orange" onClick={() => setDisablingPreset(preset)}>
                            <IconBan size="1rem" />
                          </TableAction>
                        )}
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

      <PresetViewModal preset={viewing} onClose={() => setViewing(null)} />

      <PresetStatusConfirmModal
        preset={disablingPreset}
        disabling={setPresetEnabled.isPending}
        onConfirm={confirmDisablePreset}
        onClose={() => setDisablingPreset(null)}
      />
    </>
  );
}
