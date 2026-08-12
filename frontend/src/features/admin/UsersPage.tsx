import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NativeSelect,
  Pagination,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { INTERNAL_USER_ROLES } from '@/api/companyUsersApi'
import { platformApi, type PlatformUser } from '@/api/platformApi'
import { queryKeys } from '@/api/queryKeys'
import { useApiMutation } from '@/hooks/useApiMutation'
import { ListControls } from '@/shared/components/ListControls'
import { TableSkeleton } from '@/shared/components/Skeletons'
import { useListQuery } from '@/shared/hooks/useListQuery'
import { TableAction } from '@/shared/components/TableAction'
import { IconPencil, IconPlayerPause, IconPlayerPlay, IconTrash, IconUserMinus } from '@tabler/icons-react'
import {
  useCreateCandidate,
  usePlatformCompanies,
  usePlatformUsers,
  useRemoveCandidate,
  useUpdateCandidate,
} from './hooks/usePlatform'

const roleOptions = INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))

interface CandidateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

const emptyCandidateForm: CandidateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const companiesQuery = usePlatformCompanies()
  const createCandidate = useCreateCandidate()
  const updateCandidate = useUpdateCandidate()
  const removeCandidate = useRemoveCandidate()

  const setUserStatus = useApiMutation({
    mutationFn: ({
      companyId,
      userId,
      status,
    }: {
      companyId: string
      userId: string
      status: 'active' | 'suspended'
    }) => platformApi.setCompanyUserStatus(companyId, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() })
    },
  })

  const removeUser = useApiMutation({
    mutationFn: ({ companyId, userId }: { companyId: string; userId: string }) =>
      platformApi.removeCompanyUser(companyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() })
    },
  })

  const createCompanyUser = useApiMutation({
    mutationFn: ({
      companyId,
      body,
    }: {
      companyId: string
      body: { email: string; role: string; password: string }
    }) => platformApi.createCompanyUser(companyId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.platform.users() })
    },
  })

  const listQuery = useListQuery({ sortBy: 'email', sortDir: 'asc' })
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const usersQuery = usePlatformUsers({
    ...listQuery.params,
    type: typeFilter ?? undefined,
    companyId: companyFilter ?? undefined,
    role: roleFilter ?? undefined,
  })

  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'company' | 'candidate'>('company')
  const [addCompany, setAddCompany] = useState<string | null>(null)
  const [addRole, setAddRole] = useState('Recruiter')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [candidateForm, setCandidateForm] =
    useState<CandidateForm>(emptyCandidateForm)

  const [editing, setEditing] = useState<PlatformUser | null>(null)
  const [removing, setRemoving] = useState<PlatformUser | null>(null)

  const users = usersQuery.data?.data ?? []
  const total = usersQuery.data?.total ?? 0
  const companies = companiesQuery.data?.data ?? []

  const displayName = (user: PlatformUser) =>
    user.type === 'candidate'
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : user.email

  const setCandidateField = (key: keyof CandidateForm, value: string) =>
    setCandidateForm((f) => ({ ...f, [key]: value }))

  const openEdit = (user: PlatformUser) => {
    setEditing(user)
    setCandidateForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      phone: '',
      password: '',
    })
  }

  const resetAddModal = () => {
    setAddOpen(false)
    setAddType('company')
    setAddCompany(null)
    setAddRole('Recruiter')
    setAddEmail('')
    setAddPassword('')
    setCandidateForm(emptyCandidateForm)
  }

  const submitAddCandidate = () => {
    createCandidate.mutate(
      {
        firstName: candidateForm.firstName,
        lastName: candidateForm.lastName,
        email: candidateForm.email,
        phone: candidateForm.phone || undefined,
        password: candidateForm.password,
      },
      { onSuccess: resetAddModal },
    )
  }

  const submitUpdate = () => {
    if (!editing) return
    updateCandidate.mutate(
      {
        id: editing.id,
        body: {
          firstName: candidateForm.firstName,
          lastName: candidateForm.lastName,
          email: candidateForm.email || undefined,
          phone: candidateForm.phone || null,
          password: candidateForm.password || undefined,
        },
      },
      { onSuccess: () => setEditing(null) },
    )
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Users</Title>
        <Button onClick={() => setAddOpen(true)}>Add user</Button>
      </Group>

      <ListControls
        searchPlaceholder="Search name or email"
        searchValue={listQuery.search}
        onSearchChange={(value) => {
          listQuery.setSearch(value)
          listQuery.setPage(1)
        }}
        filters={[
          {
            key: 'type',
            placeholder: 'Type',
            data: [
              { value: 'company', label: 'Company' },
              { value: 'candidate', label: 'Candidate' },
            ],
            value: typeFilter,
            onChange: (value) => {
              setTypeFilter(value)
              listQuery.setPage(1)
            },
          },
          {
            key: 'company',
            placeholder: 'Company',
            searchable: true,
            data: companies.map((c) => ({ value: c.id, label: c.name })),
            value: companyFilter,
            onChange: (value) => {
              setCompanyFilter(value)
              listQuery.setPage(1)
            },
          },
          {
            key: 'role',
            placeholder: 'Role',
            data: roleOptions,
            value: roleFilter,
            onChange: (value) => {
              setRoleFilter(value)
              listQuery.setPage(1)
            },
          },
        ]}
        sortOptions={[
          { value: 'email', label: 'Email' },
          { value: 'createdAt', label: 'Date created' },
        ]}
        sortBy={listQuery.sortBy}
        onSortByChange={(value) => {
          listQuery.setSortBy(value)
          listQuery.setPage(1)
        }}
        sortDir={listQuery.sortDir}
        onToggleSortDir={listQuery.toggleSortDir}
      />

      {usersQuery.isLoading ? (
        <TableSkeleton
          headers={['Name / Email', 'Type', 'Company', 'Role', 'Status', 'Created', 'Actions']}
        />
      ) : users.length === 0 ? (
        <Text c="dimmed">No users match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name / Email</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((user) => (
                <Table.Tr key={`${user.type}-${user.id}`}>
                  <Table.Td>
                    {displayName(user)}
                    {user.type === 'candidate' && (
                      <Text size="xs" c="dimmed">
                        {user.email}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={user.type === 'company' ? 'blue' : 'violet'}>
                      {user.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{user.companyName ?? '—'}</Table.Td>
                  <Table.Td>{user.role}</Table.Td>
                  <Table.Td>
                    {user.status ? (
                      <Badge
                        variant="light"
                        color={user.status === 'suspended' ? 'red' : 'green'}
                      >
                        {user.status}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>{dayjs(user.createdAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    {user.type === 'company' ? (
                      <Group gap="xs">
                        <TableAction
                          label={user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                          color={user.status === 'suspended' ? 'green' : 'yellow'}
                          onClick={() => {
                            if (!user.companyId) return
                            setUserStatus.mutate({
                              companyId: user.companyId,
                              userId: user.id,
                              status:
                                user.status === 'suspended' ? 'active' : 'suspended',
                            })
                          }}
                        >
                          {user.status === 'suspended' ? (
                            <IconPlayerPlay size="1rem" />
                          ) : (
                            <IconPlayerPause size="1rem" />
                          )}
                        </TableAction>
                        <TableAction
                          label="Remove"
                          color="red"
                          onClick={() => setRemoving(user)}
                        >
                          <IconUserMinus size="1rem" />
                        </TableAction>
                      </Group>
                    ) : (
                      <Group gap="xs">
                        <TableAction label="Edit" onClick={() => openEdit(user)}>
                          <IconPencil size="1rem" />
                        </TableAction>
                        <TableAction
                          label="Delete"
                          color="red"
                          onClick={() => setRemoving(user)}
                        >
                          <IconTrash size="1rem" />
                        </TableAction>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Pagination total={Math.max(1, Math.ceil(total / 10))} value={listQuery.page} onChange={listQuery.setPage} size="sm" />
          </Group>
        </>
      )}

      <Modal opened={addOpen} onClose={resetAddModal} title="Add user">
        <Stack>
          <NativeSelect
            label="Type"
            data={[
              { value: 'company', label: 'Company user' },
              { value: 'candidate', label: 'Candidate' },
            ]}
            value={addType}
            onChange={(e) =>
              setAddType(e.currentTarget.value as 'company' | 'candidate')
            }
          />
          {addType === 'company' ? (
            <>
              <Select
                label="Company"
                required
                searchable
                data={companies.map((c) => ({ value: c.id, label: c.name }))}
                value={addCompany}
                onChange={setAddCompany}
              />
              <Select
                label="Role"
                data={roleOptions}
                value={addRole}
                onChange={(value) => setAddRole(value ?? 'Recruiter')}
              />
              <TextInput
                label="Email"
                required
                value={addEmail}
                onChange={(e) => setAddEmail(e.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                description="No email is sent — share the password out-of-band."
                required
                value={addPassword}
                onChange={(e) => setAddPassword(e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button
                  loading={createCompanyUser.isPending}
                  disabled={
                    !addCompany ||
                    !addEmail.includes('@') ||
                    addPassword.length < 8
                  }
                  onClick={() => {
                    if (!addCompany) return
                    createCompanyUser.mutate(
                      {
                        companyId: addCompany,
                        body: { email: addEmail, role: addRole, password: addPassword },
                      },
                      { onSuccess: resetAddModal },
                    )
                  }}
                >
                  Add
                </Button>
              </Group>
            </>
          ) : (
            <>
              <TextInput
                label="First name"
                required
                value={candidateForm.firstName}
                onChange={(e) => setCandidateField('firstName', e.currentTarget.value)}
              />
              <TextInput
                label="Last name"
                required
                value={candidateForm.lastName}
                onChange={(e) => setCandidateField('lastName', e.currentTarget.value)}
              />
              <TextInput
                label="Email"
                required
                value={candidateForm.email}
                onChange={(e) => setCandidateField('email', e.currentTarget.value)}
              />
              <TextInput
                label="Phone"
                value={candidateForm.phone}
                onChange={(e) => setCandidateField('phone', e.currentTarget.value)}
              />
              <PasswordInput
                label="Password"
                description="No email is sent — share the password out-of-band."
                required
                value={candidateForm.password}
                onChange={(e) => setCandidateField('password', e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button
                  loading={createCandidate.isPending}
                  disabled={
                    !candidateForm.firstName ||
                    !candidateForm.lastName ||
                    !candidateForm.email.includes('@') ||
                    candidateForm.password.length < 8
                  }
                  onClick={submitAddCandidate}
                >
                  Add
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.firstName ?? ''} ${editing?.lastName ?? ''}`}
      >
        <Stack>
          <TextInput
            label="First name"
            required
            value={candidateForm.firstName}
            onChange={(e) => setCandidateField('firstName', e.currentTarget.value)}
          />
          <TextInput
            label="Last name"
            required
            value={candidateForm.lastName}
            onChange={(e) => setCandidateField('lastName', e.currentTarget.value)}
          />
          <TextInput
            label="Email"
            required
            value={candidateForm.email}
            onChange={(e) => setCandidateField('email', e.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            value={candidateForm.phone}
            onChange={(e) => setCandidateField('phone', e.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            description="Leave blank to keep the current password."
            value={candidateForm.password}
            onChange={(e) => setCandidateField('password', e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={updateCandidate.isPending}
              disabled={!candidateForm.firstName || !candidateForm.lastName}
              onClick={submitUpdate}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing?.type === 'company' ? 'Remove user' : 'Delete candidate'}
      >
        <Stack>
          <Alert color="red">
            {removing?.type === 'company'
              ? `Remove ${removing?.email}? They will lose access to the company.`
              : `Delete ${removing?.email}? Their applications and profile will be removed.`}
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                const target = removing
                if (!target) return
                if (target.type === 'company' && target.companyId) {
                  removeUser.mutate(
                    { companyId: target.companyId, userId: target.id },
                    { onSuccess: () => setRemoving(null) },
                  )
                } else {
                  removeCandidate.mutate(target.id, {
                    onSuccess: () => setRemoving(null),
                  })
                }
              }}
            >
              {removing?.type === 'company' ? 'Remove' : 'Delete'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
