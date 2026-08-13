import { Badge, Card, Checkbox, Divider, Group, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import { IconBan, IconCopy, IconCircleCheck, IconEye, IconPencil, IconTrash } from '@tabler/icons-react';
import { permissionLabel, type PermissionPreset } from '@/api/permissionsApi';
import { TableAction } from './TableAction';

interface PresetCardsProps {
  presets: PermissionPreset[];
  locked: (preset: PermissionPreset) => boolean;
  onView?: (preset: PermissionPreset) => void;
  onDuplicate?: (preset: PermissionPreset) => void;
  onEdit?: (preset: PermissionPreset) => void;
  onDelete?: (preset: PermissionPreset) => void;
  onEnable?: (preset: PermissionPreset) => void;
  onDisable?: (preset: PermissionPreset) => void;
  deleting?: boolean;
  scopeLabel?: (preset: PermissionPreset) => string | null;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

export function PresetCards({
  presets,
  locked,
  onView,
  onDuplicate,
  onEdit,
  onDelete,
  onEnable,
  onDisable,
  deleting,
  scopeLabel,
  selectedIds,
  onToggleSelect,
}: PresetCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
      {presets.map((preset) => {
        const isLocked = locked(preset);
        const scope = scopeLabel?.(preset) ?? null;
        return (
          <Card key={preset.id} withBorder radius="md" padding="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Text fw={600} size="sm" lineClamp={2} style={{ flex: 1 }}>
                {preset.name}
              </Text>
              {(preset.isDefault || scope) && (
                <Group gap={4} wrap="nowrap">
                  {preset.isDefault && (
                    <Badge size="xs" variant="light" color="gray">
                      default
                    </Badge>
                  )}
                  {scope && (
                    <Badge size="xs" variant="light" color={preset.isDefault ? 'gray' : 'indigo'}>
                      {scope}
                    </Badge>
                  )}
                </Group>
              )}
              {preset.isEnabled === false && (
                <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                  disabled
                </Badge>
              )}
              {onToggleSelect && !isLocked && (
                <Checkbox
                  checked={selectedIds?.includes(preset.id)}
                  onChange={() => onToggleSelect(preset.id)}
                  aria-label={`Select ${preset.name}`}
                  size="sm"
                />
              )}
            </Group>

            <Stack gap={4} mt="sm">
              <Group gap="xs">
                <Badge size="xs" variant="light" color="blue">
                  {preset.role}
                </Badge>
                <Text size="xs" c="dimmed">
                  {preset.permissions.length} permissions
                </Text>
                <Text size="xs" c="dimmed">
                  In use: {preset.usageCount}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" lineClamp={2}>
                {preset.permissions.length === 0
                  ? 'No permissions'
                  : preset.permissions.map(permissionLabel).join(', ')}
              </Text>
            </Stack>

            <Divider my="sm" />

            <Group justify="flex-end" gap="xs">
              {isLocked && onView && (
                <TableAction label="View" color="gray" onClick={() => onView(preset)}>
                  <IconEye size="1rem" />
                </TableAction>
              )}
              {onDuplicate && (
                <TableAction
                  label="Duplicate"
                  color="blue"
                  onClick={() => onDuplicate(preset)}
                >
                  <IconCopy size="1rem" />
                </TableAction>
              )}
              {!isLocked && onEnable && onDisable && (
                preset.isEnabled === false ? (
                  <TableAction label="Enable" color="teal" onClick={() => onEnable(preset)}>
                    <IconCircleCheck size="1rem" />
                  </TableAction>
                ) : (
                  <TableAction label="Disable" color="orange" onClick={() => onDisable(preset)}>
                    <IconBan size="1rem" />
                  </TableAction>
                )
              )}
              {!isLocked && onEdit && (
                <TableAction label="Edit" onClick={() => onEdit(preset)}>
                  <IconPencil size="1rem" />
                </TableAction>
              )}
              {!isLocked && onDelete && (
                <TableAction
                  label="Delete"
                  color="red"
                  disabled={preset.usageCount > 0}
                  loading={deleting}
                  onClick={() => onDelete(preset)}
                >
                  <IconTrash size="1rem" />
                </TableAction>
              )}
            </Group>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

export function PresetCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} withBorder radius="md" padding="md">
          <Skeleton height={16} width="60%" mb="sm" />
          <Skeleton height={12} width="40%" mb="xs" />
          <Skeleton height={12} width="80%" />
          <Divider my="sm" />
          <Group justify="flex-end" gap="xs">
            <Skeleton height={30} width={30} radius="sm" />
            <Skeleton height={30} width={30} radius="sm" />
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
