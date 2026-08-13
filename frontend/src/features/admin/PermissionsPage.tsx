import { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  SegmentedControl,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
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
import { PresetBulkDelete } from '@/shared/components/PresetBulkDelete';
import { PresetViewModal } from '@/shared/components/PresetViewModal';
import { TableAction } from '@/shared/components/TableAction';
import { TableSkeleton } from '@/shared/components/Skeletons';
import {
  PresetEditorModal,
  type PresetEditorValue,
} from '@/shared/components/PresetEditorModal';
import {
  useBulkDeletePlatformPreset,
  useCreatePlatformPreset,
  useDeletePlatformPreset,
  usePlatformPermissions,
  useUpdatePlatformPreset,
} from './hooks/usePlatformPermissions';

interface PlatformPreset extends PermissionPreset {
  companyId: string | null;
  companyName: string | null;
}

export function PermissionsPage() {
  const presetsQuery = usePlatformPermissions();
  const createPreset = useCreatePlatformPreset();
  const updatePreset = useUpdatePlatformPreset();
  const deletePreset = useDeletePlatformPreset();

  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    preset: PlatformPreset | null;
  } | null>(null);
  const [viewing, setViewing] = useState<PlatformPreset | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() =>
    localStorage.getItem('presetViewMode') === 'table' ? 'table' : 'cards',
  );
  const changeViewMode = (mode: string | null) => {
    const next = mode === 'table' ? 'table' : 'cards';
    setViewMode(next);
    localStorage.setItem('presetViewMode', next);
  };

  const presets = presetsQuery.data?.presets ?? [];
  const companyPresets = presets.filter((p) => p.companyId !== null);
  const anySaving = createPreset.isPending || updatePreset.isPending;

  const mainPresets = presets.filter((p) => p.isDefault || p.companyId === null);
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
    ? mainPresets
    : mainPresets.filter((p) => !p.isDefault);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const bulkDelete = useBulkDeletePlatformPreset();
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const clearSelection = () => setSelectedIds([]);
  const selectedPresets = presets.filter((p) => selectedIds.includes(p.id));
  const inUseCount = selectedPresets.filter((p) => p.usageCount > 0).length;
  const affectedUsers = selectedPresets.reduce((sum, p) => sum + p.usageCount, 0);
  const confirmBulkDelete = () => {
    bulkDelete.mutate(selectedPresets.map((p) => p.id), { onSuccess: clearSelection });
  };

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

  const actionRow = (preset: PlatformPreset) => (
    <Group gap="xs">
      {preset.isDefault && (
        <TableAction label="View" color="gray" onClick={() => setViewing(preset)}>
          <IconEye size="1rem" />
        </TableAction>
      )}
      <TableAction label="Duplicate" color="blue" onClick={() => setEditor({ mode: 'duplicate', preset })}>
        <IconCopy size="1rem" />
      </TableAction>
      {!preset.isDefault && (
        <>
          <TableAction label="Edit" onClick={() => setEditor({ mode: 'edit', preset })}>
            <IconPencil size="1rem" />
          </TableAction>
          <Tooltip label="Reassign users before deleting" disabled={preset.usageCount === 0}>
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
  );

  if (presetsQuery.isLoading) {
    return viewMode === 'cards' ? (
      <PresetCardSkeleton />
    ) : (
      <TableSkeleton headers={['Name', 'Role', 'Permissions', 'Actions']} />
    );
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>Permission presets</Title>
          <Text size="sm" c="dimmed">
            Global presets are available to every company. Default presets are read-only.
          </Text>
        </div>
        <Group gap="xs">
          <Button leftSection={<IconPlus size="1rem" />} onClick={() => setEditor({ mode: 'create', preset: null })}>
            Create global preset
          </Button>
          <TableAction
            label={showDefaults ? 'Hide defaults' : 'Show defaults'}
            color="gray"
            onClick={toggleDefaults}
          >
            {showDefaults ? <IconEyeOff size="1rem" /> : <IconEye size="1rem" />}
          </TableAction>
          <SegmentedControl
            size="md"
            value={viewMode}
            onChange={changeViewMode}
            data={[
              { value: 'cards', label: <Group gap={2} wrap="nowrap"><IconLayoutGrid size="0.9rem" />Cards</Group> },
              { value: 'table', label: <Group gap={2} wrap="nowrap"><IconTable size="0.9rem" />Table</Group> },
            ]}
          />
        </Group>
      </Group>

      <PresetBulkDelete
        selectedCount={selectedPresets.length}
        inUseCount={inUseCount}
        affectedUsers={affectedUsers}
        deleting={bulkDelete.isPending}
        onConfirm={confirmBulkDelete}
        onClear={clearSelection}
      />

      {mainPresets.length === 0 ? (
        <Text c="dimmed">No presets yet.</Text>
      ) : visiblePresets.length === 0 ? (
        <Text c="dimmed">Defaults are hidden. Click the eye icon to show them.</Text>
      ) : viewMode === 'cards' ? (
        <PresetCards
          presets={visiblePresets}
          locked={(p) => p.isDefault}
          onView={(preset) => setViewing(preset as PlatformPreset)}
          onDuplicate={(preset) => setEditor({ mode: 'duplicate', preset: preset as PlatformPreset })}
          onEdit={(preset) => setEditor({ mode: 'edit', preset: preset as PlatformPreset })}
          onDelete={(preset) => deletePreset.mutate(preset.id)}
          deleting={deletePreset.isPending}
          scopeLabel={(p) => (p.isDefault ? 'System' : 'Global')}
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
            <Table.Th>Scope</Table.Th>
            <Table.Th>Permissions</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visiblePresets.map((preset) => (
              <Table.Tr key={preset.id}>
                <Table.Td>
                  {!preset.isDefault && (
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
                  <Badge size="xs" variant="light" color={preset.isDefault ? 'gray' : 'indigo'}>
                    {preset.isDefault ? 'System' : 'Global'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {preset.permissions.join(', ') || 'No permissions'}
                  </Text>
                </Table.Td>
                <Table.Td>{actionRow(preset)}</Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>
      )}

      {companyPresets.length > 0 && (
        <>
          <Divider my="lg" />
          <Title order={4} mb="md">
            Company presets
          </Title>
          {viewMode === 'cards' ? (
            <PresetCards
              presets={companyPresets}
              locked={() => true}
              scopeLabel={(p) => (p as PlatformPreset).companyName}
            />
          ) : (
            <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>In use</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {companyPresets.map((preset) => (
                <Table.Tr key={preset.id}>
                  <Table.Td>{preset.name}</Table.Td>
                  <Table.Td>{preset.companyName ?? '—'}</Table.Td>
                  <Table.Td>{preset.role}</Table.Td>
                  <Table.Td>{preset.usageCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          )}
        </>
      )}

      <PresetEditorModal
        opened={editor !== null}
        title={
          editor?.mode === 'edit'
            ? 'Edit global preset'
            : editor?.mode === 'duplicate'
              ? 'Duplicate preset'
              : 'Create global preset'
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
        onDuplicate={() => {
          if (viewing) setEditor({ mode: 'duplicate', preset: viewing });
        }}
      />
    </>
  );
}
