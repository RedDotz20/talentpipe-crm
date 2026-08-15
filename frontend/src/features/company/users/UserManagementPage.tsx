import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { z } from 'zod';
import dayjs from 'dayjs';
import { useAuthStore } from '@/api/useAuth';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { TableAction } from '@/shared/components/TableAction';
import { ExportCsvButton } from '@/shared/components/ExportCsvButton';
import { UserAvatar } from '@/shared/components/UserAvatar';
import { IconKey, IconPlayerPause, IconPlayerPlay, IconShieldLock, IconUserMinus } from '@tabler/icons-react';
import {
  INTERNAL_USER_ROLES,
  type InternalUserRole,
  type CreateUserInput,
  type CompanyUser,
  companyUsersApi,
} from '@/api/companyUsersApi';
import {
  useAssignPreset,
  useCreateUser,
  useCompanyUsers,
  useRemoveUser,
  useResetUserPassword,
  useSetUserStatus,
  useUpdateUserRole,
} from './hooks/useCompanyUsers';
import { useCompanyPermissionPresets } from '../permissions/hooks/useCompanyPermissions';
import { useCompanySettings } from '../settings/hooks/useCompanySettings';

const CreateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email'),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const ResetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export function UserManagementPage() {
  const userId = useAuthStore((s) => s.userId);
  const usersQuery = useCompanyUsers();
  const settingsQuery = useCompanySettings();
  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const setUserStatus = useSetUserStatus();
  const resetPassword = useResetUserPassword();
  const removeUser = useRemoveUser();
  const assignPreset = useAssignPreset();
  const presetsQuery = useCompanyPermissionPresets();
  const [createOpen, setCreateOpen] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [resetting, setResetting] = useState<CompanyUser | null>(null);
  const [removing, setRemoving] = useState<CompanyUser | null>(null);
  const [assigning, setAssigning] = useState<CompanyUser | null>(null);
  const [assignValue, setAssignValue] = useState<string | null>('default');

  const presetsForRole = (role: string) =>
    (presetsQuery.data?.presets ?? []).filter(
      (p) => p.role === role && p.isEnabled !== false,
    );

  const resetForm = useForm({
    validate: schemaResolver(ResetSchema),
    initialValues: { password: '' },
  });

  const form = useForm({
    validate: schemaResolver(CreateSchema),
    initialValues: {
      name: '',
      email: '',
      role: 'Recruiter' as InternalUserRole,
      password: '',
      presetId: 'default',
    },
  });

  const slug = settingsQuery.data?.slug;
  const deriveEmail = (name: string) => {
    const first = name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9.]/g, '');
    return first && slug ? `${first}@${slug}.com` : '';
  };

  const users = usersQuery.data ?? [];

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Team members</Title>
        <Group gap="xs">
          <ExportCsvButton resource="company-users" request={companyUsersApi.exportCsv} />
          <Button onClick={() => setCreateOpen(true)}>Add team member</Button>
        </Group>
      </Group>

      {usersQuery.isLoading ? (
        <TableSkeleton headers={['User', 'Role', 'Status', 'Created', 'Actions']} />
      ) : users.length === 0 ? (
        <Text c="dimmed">No users yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Group gap="sm">
                    <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
                    <Stack gap={0}>
                      <Text size="sm">{user.name ?? '—'}</Text>
                      <Text size="xs" c="dimmed">{user.email}</Text>
                    </Stack>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    data={INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))}
                    value={user.role}
                    disabled={user.id === userId}
                    onChange={(value) => {
                      if (value) {
                        updateRole.mutate({
                          userId: user.id,
                          role: value as InternalUserRole,
                        });
                      }
                    }}
                    w={160}
                  />
                </Table.Td>
                <Table.Td>
                  <Badge color={user.status === 'active' ? 'teal' : 'red'} variant="light">
                    {user.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {user.createdAt
                    ? dayjs(user.createdAt).format('MMM D, YYYY')
                    : '—'}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {user.status === 'active' ? (
                      <TableAction
                        label="Suspend"
                        color="orange"
                        disabled={user.id === userId}
                        loading={setUserStatus.isPending}
                        onClick={() =>
                          setUserStatus.mutate({ userId: user.id, status: 'suspended' })
                        }
                      >
                        <IconPlayerPause size="1rem" />
                      </TableAction>
                    ) : (
                      <TableAction
                        label="Reactivate"
                        color="teal"
                        loading={setUserStatus.isPending}
                        onClick={() =>
                          setUserStatus.mutate({ userId: user.id, status: 'active' })
                        }
                      >
                        <IconPlayerPlay size="1rem" />
                      </TableAction>
                    )}
                    <TableAction
                      label="Reset password"
                      color="blue"
                      disabled={user.id === userId}
                      onClick={() => {
                        resetForm.reset();
                        setResetting(user);
                      }}
                    >
                      <IconKey size="1rem" />
                    </TableAction>
                    <TableAction
                      label="Remove"
                      color="red"
                      disabled={user.id === userId}
                      onClick={() => setRemoving(user)}
                    >
                      <IconUserMinus size="1rem" />
                    </TableAction>
                    {user.role !== 'CompanyAdmin' && (
                      <TableAction
                        label="Permissions"
                        color="violet"
                        onClick={() => {
                          setAssignValue(user.presetId ?? 'default');
                          setAssigning(user);
                        }}
                      >
                        <IconShieldLock size="1rem" />
                      </TableAction>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create account"
      >
        <form
          onSubmit={form.onSubmit((values) => {
            createUser.mutate(
              {
                name: values.name || undefined,
                email: values.email,
                role: values.role,
                password: values.password,
                ...(values.presetId === 'default'
                  ? {}
                  : { presetId: values.presetId }),
              } as CreateUserInput,
              {
                onSuccess: () => {
                  form.reset();
                  setEmailTouched(false);
                  setCreateOpen(false);
                },
              },
            );
          })}
        >
          <Stack>
            <TextInput
              label="Name"
              placeholder="John Smith"
              description={slug ? `Email will be suggested as name@${slug}.com` : undefined}
              onChange={(event) => {
                const name = event.currentTarget.value;
                form.setFieldValue('name', name);
                if (!emailTouched) {
                  form.setFieldValue('email', deriveEmail(name));
                }
              }}
            />
            <TextInput
              label="Email"
              placeholder={slug ? `john@${slug}.com` : 'john@company.com'}
              required
              {...form.getInputProps('email', {
                onChange: () => {
                  setEmailTouched(true);
                },
              })}
            />
            <Select
              label="Role"
              data={INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))}
              required
              {...form.getInputProps('role')}
              onChange={(value) => {
                form.setFieldValue('role', value ?? 'Recruiter');
                form.setFieldValue('presetId', 'default');
              }}
            />
            {form.values.role !== 'CompanyAdmin' && (
              <Select
                label="Permission preset"
                data={[
                  { value: 'default', label: 'Role default' },
                  ...presetsForRole(form.values.role).map((p) => ({
                    value: p.id,
                    label: `${p.name}${p.isDefault ? ' (default)' : ''}`,
                  })),
                ]}
                defaultValue="default"
                key={`${form.values.role}-${createOpen}`}
                onChange={(value) => form.setFieldValue('presetId', value ?? 'default')}
              />
            )}
            <PasswordInput
              label="Password"
              description="No email is sent — share the password with the user out-of-band."
              required
              {...form.getInputProps('password')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={createUser.isPending}>
                Create account
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={resetting !== null}
        onClose={() => setResetting(null)}
        title="Reset password"
      >
        <form
          onSubmit={resetForm.onSubmit((values) => {
            if (resetting) {
              resetPassword.mutate(
                { userId: resetting.id, password: values.password },
                {
                  onSuccess: () => {
                    resetForm.reset();
                    setResetting(null);
                  },
                },
              );
            }
          })}
        >
          <Stack>
            <Alert color="blue">
              Reset the password for <b>{resetting?.email}</b>? Their current
              sessions are revoked and they must sign in with the new password.
            </Alert>
            <PasswordInput
              label="New password"
              description="No email is sent — share the new password out-of-band."
              required
              {...resetForm.getInputProps('password')}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={resetPassword.isPending}>
                Reset password
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove team member"
      >
        <Stack>
          <Alert color="red">
            Remove <b>{removing?.email}</b>? They will lose access immediately.
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={removeUser.isPending}
              onClick={() => {
                if (removing) {
                  removeUser.mutate(removing.id, {
                    onSuccess: () => setRemoving(null),
                  });
                }
              }}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={assigning !== null}
        onClose={() => setAssigning(null)}
        title={`Permissions — ${assigning?.email ?? ''}`}
      >
        <Stack>
          <Select
            label="Permission preset"
            data={[
              { value: 'default', label: 'Role default' },
              ...(assigning ? presetsForRole(assigning.role) : []).map((p) => ({
                value: p.id,
                label: p.name,
              })),
            ]}
            value={assignValue}
            onChange={setAssignValue}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              loading={assignPreset.isPending}
              onClick={() => {
                if (assigning) {
                  assignPreset.mutate(
                    {
                      userId: assigning.id,
                      presetId: assignValue === 'default' ? null : assignValue,
                    },
                    { onSuccess: () => setAssigning(null) },
                  );
                }
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
