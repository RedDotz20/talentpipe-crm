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
import { IconPlayerPause, IconPlayerPlay, IconUserMinus } from '@tabler/icons-react';
import {
  INTERNAL_USER_ROLES,
  type InternalUserRole,
  type CompanyUser,
} from '@/api/companyUsersApi';
import {
  useCreateUser,
  useCompanyUsers,
  useRemoveUser,
  useSetUserStatus,
  useUpdateUserRole,
} from './hooks/useCompanyUsers';
import { useCompanySettings } from '../settings/hooks/useCompanySettings';

const CreateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email'),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export function UserManagementPage() {
  const userId = useAuthStore((s) => s.userId);
  const usersQuery = useCompanyUsers();
  const settingsQuery = useCompanySettings();
  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const setUserStatus = useSetUserStatus();
  const removeUser = useRemoveUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [removing, setRemoving] = useState<CompanyUser | null>(null);

  const form = useForm({
    validate: schemaResolver(CreateSchema),
    initialValues: {
      name: '',
      email: '',
      role: 'Recruiter' as InternalUserRole,
      password: '',
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
        <Button onClick={() => setCreateOpen(true)}>Add team member</Button>
      </Group>

      {usersQuery.isLoading ? (
        <TableSkeleton headers={['Email', 'Role', 'Status', 'Created', 'Actions']} />
      ) : users.length === 0 ? (
        <Text c="dimmed">No users yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>{user.email}</Table.Td>
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
                      label="Remove"
                      color="red"
                      disabled={user.id === userId}
                      onClick={() => setRemoving(user)}
                    >
                      <IconUserMinus size="1rem" />
                    </TableAction>
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
              { email: values.email, role: values.role, password: values.password },
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
              onChange={(event) => {
                setEmailTouched(true);
                form.setFieldValue('email', event.currentTarget.value);
              }}
              {...form.getInputProps('email')}
            />
            <Select
              label="Role"
              data={INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))}
              required
              {...form.getInputProps('role')}
            />
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
    </>
  );
}
