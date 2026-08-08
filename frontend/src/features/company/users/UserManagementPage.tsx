import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
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
import {
  INTERNAL_USER_ROLES,
  type InternalUserRole,
  type CompanyUser,
} from '@/api/companyUsersApi';
import {
  useInviteUser,
  useCompanyUsers,
  useRemoveUser,
  useUpdateUserRole,
} from './hooks/useCompanyUsers';

const InviteSchema = z.object({
  email: z.string().email('Invalid email'),
  role: z.enum(INTERNAL_USER_ROLES, { message: 'Invalid role' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export function UserManagementPage() {
  const userId = useAuthStore((s) => s.userId);
  const usersQuery = useCompanyUsers();
  const inviteUser = useInviteUser();
  const updateRole = useUpdateUserRole();
  const removeUser = useRemoveUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<CompanyUser | null>(null);

  const form = useForm({
    validate: schemaResolver(InviteSchema),
    initialValues: { email: '', role: 'Recruiter' as InternalUserRole, password: '' },
  });

  const users = usersQuery.data ?? [];

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Team members</Title>
        <Button onClick={() => setInviteOpen(true)}>Invite user</Button>
      </Group>

      {usersQuery.isLoading ? (
        <Loader />
      ) : users.length === 0 ? (
        <Text c="dimmed">No users yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
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
                  {user.createdAt
                    ? dayjs(user.createdAt).format('MMM D, YYYY')
                    : '—'}
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    disabled={user.id === userId}
                    onClick={() => setRemoving(user)}
                  >
                    Remove
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite team member"
      >
        <form
          onSubmit={form.onSubmit((values) => {
            inviteUser.mutate(values, {
              onSuccess: () => {
                form.reset();
                setInviteOpen(false);
              },
            });
          })}
        >
          <Stack>
            <TextInput
              label="Email"
              placeholder="recruiter@acme.com"
              required
              {...form.getInputProps('email')}
            />
            <Select
              label="Role"
              data={INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))}
              required
              {...form.getInputProps('role')}
            />
            <PasswordInput
              label="Initial password"
              description="No email is sent — share the password with the user out-of-band."
              required
              {...form.getInputProps('password')}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={inviteUser.isPending}>
                Invite
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
