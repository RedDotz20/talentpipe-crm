import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NativeSelect,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { INTERNAL_USER_ROLES } from '@/api/orgUsersApi'
import type {
  PlatformApplication,
  PlatformInterview,
  PlatformUser,
} from '@/api/platformApi'
import {
  useCreateTenantUser,
  useMoveApplicationStage,
  usePlatformApplications,
  usePlatformInterviews,
  usePlatformStages,
  useRemoveTenantUser,
  useRescheduleInterview,
  useSetTenantStatus,
  useSetTenantUserStatus,
  useTenantDetail,
  useTenantUsers,
  useUpdateTenantUser,
} from './hooks/usePlatform'

const roleOptions = INTERNAL_USER_ROLES.map((r) => ({ value: r, label: r }))

export function TenantDetailPage({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate()
  const { data: tenant, isLoading, error } = useTenantDetail(tenantId)
  const setStatus = useSetTenantStatus()

  if (isLoading) return <Loader />
  if (error || !tenant) {
    return <Alert color="red">Tenant not found.</Alert>
  }

  const isSuspended = tenant.status === 'suspended'

  const handleToggle = () => {
    setStatus.mutate(
      { id: tenant.id, status: isSuspended ? 'active' : 'suspended' },
      { onSuccess: () => navigate({ to: '/admin/tenants' }) },
    )
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{tenant.name}</Title>
        <Badge variant="light" color={isSuspended ? 'red' : 'green'}>
          {tenant.status}
        </Badge>
      </Group>

      <Card withBorder>
        <Stack gap="xs">
          <Text size="sm">
            Slug: <b>{tenant.slug}</b>
          </Text>
          <Text size="sm">
            Plan: <b>{tenant.plan}</b>
          </Text>
          <SimpleGrid cols={2}>
            <Text size="sm">
              Users: <b>{tenant.users}</b>
            </Text>
            <Text size="sm">
              Applications: <b>{tenant.applications}</b>
            </Text>
          </SimpleGrid>
        </Stack>
      </Card>

      <Group>
        <Button
          color={isSuspended ? 'green' : 'red'}
          loading={setStatus.isPending}
          onClick={handleToggle}
        >
          {isSuspended ? 'Reactivate' : 'Suspend'}
        </Button>
        <Button variant="light" onClick={() => navigate({ to: '/admin/tenants' })}>
          Back
        </Button>
      </Group>

      <Tabs defaultValue="users">
        <Tabs.List>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="applications">Applications</Tabs.Tab>
          <Tabs.Tab value="interviews">Interviews</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="md">
          <UsersTab tenantId={tenantId} />
        </Tabs.Panel>
        <Tabs.Panel value="applications" pt="md">
          <ApplicationsTab tenantId={tenantId} />
        </Tabs.Panel>
        <Tabs.Panel value="interviews" pt="md">
          <InterviewsTab tenantId={tenantId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}

function UsersTab({ tenantId }: { tenantId: string }) {
  const usersQuery = useTenantUsers(tenantId)
  const createUser = useCreateTenantUser(tenantId)
  const updateUser = useUpdateTenantUser(tenantId)
  const setUserStatus = useSetTenantUserStatus(tenantId)
  const removeUser = useRemoveTenantUser(tenantId)

  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Recruiter')
  const [password, setPassword] = useState('')
  const [resetTarget, setResetTarget] = useState<PlatformUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [removing, setRemoving] = useState<PlatformUser | null>(null)

  const users = usersQuery.data ?? []

  const closeCreate = () => {
    setCreateOpen(false)
    setEmail('')
    setRole('Recruiter')
    setPassword('')
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={4}>Team</Title>
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          Add user
        </Button>
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
              <Table.Th>Status</Table.Th>
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
                    data={roleOptions}
                    value={user.role}
                    w={160}
                    onChange={(value) => {
                      if (value) {
                        updateUser.mutate({ userId: user.id, body: { role: value } })
                      }
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={user.status === 'suspended' ? 'red' : 'green'}
                  >
                    {user.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        setResetTarget(user)
                        setNewPassword('')
                      }}
                    >
                      Reset password
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color={user.status === 'suspended' ? 'green' : 'yellow'}
                      onClick={() =>
                        setUserStatus.mutate({
                          userId: user.id,
                          status: user.status === 'suspended' ? 'active' : 'suspended',
                        })
                      }
                    >
                      {user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => setRemoving(user)}
                    >
                      Remove
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={closeCreate} title="Add user">
        <Stack>
          <TextInput
            label="Email"
            placeholder="recruiter@acme.com"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <NativeSelect
            label="Role"
            data={[...INTERNAL_USER_ROLES]}
            value={role}
            onChange={(e) => setRole(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Initial password"
            description="No email is sent — share the password out-of-band."
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              loading={createUser.isPending}
              disabled={!email.includes('@') || password.length < 8}
              onClick={() =>
                createUser.mutate(
                  { email, role, password },
                  { onSuccess: closeCreate },
                )
              }
            >
              Add
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={`Reset password for ${resetTarget?.email ?? ''}`}
      >
        <Stack>
          <PasswordInput
            label="New password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 8}
              loading={updateUser.isPending}
              onClick={() => {
                if (resetTarget) {
                  updateUser.mutate(
                    { userId: resetTarget.id, body: { password: newPassword } },
                    { onSuccess: () => setResetTarget(null) },
                  )
                }
              }}
            >
              Reset
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove user"
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
                  removeUser.mutate(removing.id, { onSuccess: () => setRemoving(null) })
                }
              }}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function ApplicationsTab({ tenantId }: { tenantId: string }) {
  const applicationsQuery = usePlatformApplications({ tenantId })
  const stagesQuery = usePlatformStages(tenantId)
  const moveStage = useMoveApplicationStage()

  const [stageTarget, setStageTarget] = useState<PlatformApplication | null>(null)
  const [stageId, setStageId] = useState('')

  const applications = applicationsQuery.data ?? []
  const stages = stagesQuery.data ?? []

  return (
    <>
      {applicationsQuery.isLoading ? (
        <Loader />
      ) : applications.length === 0 ? (
        <Text c="dimmed">No applications yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Candidate</Table.Th>
              <Table.Th>Job</Table.Th>
              <Table.Th>Stage</Table.Th>
              <Table.Th>Applied</Table.Th>
              <Table.Th>Match</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {applications.map((app) => (
              <Table.Tr key={app.id}>
                <Table.Td>{app.candidateName}</Table.Td>
                <Table.Td>{app.jobTitle}</Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      setStageTarget(app)
                      setStageId('')
                    }}
                  >
                    {app.stageName}
                  </Button>
                </Table.Td>
                <Table.Td>{dayjs(app.appliedAt).format('MMM D, YYYY')}</Table.Td>
                <Table.Td>
                  {app.matchScore != null ? `${app.matchScore}%` : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={stageTarget !== null}
        onClose={() => setStageTarget(null)}
        title={`Move ${stageTarget?.candidateName ?? ''} to stage`}
      >
        <Stack>
          <Select
            label="Stage"
            data={stages.map((s) => ({ value: s.id, label: s.name }))}
            value={stageId || null}
            onChange={(value) => setStageId(value ?? '')}
            searchable
            required
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setStageTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!stageId}
              loading={moveStage.isPending}
              onClick={() => {
                if (stageTarget && stageId) {
                  moveStage.mutate(
                    { id: stageTarget.id, stageId },
                    { onSuccess: () => setStageTarget(null) },
                  )
                }
              }}
            >
              Move
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

function InterviewsTab({ tenantId }: { tenantId: string }) {
  const interviewsQuery = usePlatformInterviews({ tenantId })
  const reschedule = useRescheduleInterview()

  const [rescheduleTarget, setRescheduleTarget] = useState<PlatformInterview | null>(
    null,
  )
  const [scheduledAt, setScheduledAt] = useState('')
  const [cancelTarget, setCancelTarget] = useState<PlatformInterview | null>(null)

  const interviews = interviewsQuery.data ?? []

  return (
    <>
      {interviewsQuery.isLoading ? (
        <Loader />
      ) : interviews.length === 0 ? (
        <Text c="dimmed">No interviews yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Candidate</Table.Th>
              <Table.Th>Job</Table.Th>
              <Table.Th>Interviewer</Table.Th>
              <Table.Th>Scheduled</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {interviews.map((interview) => (
              <Table.Tr key={interview.id}>
                <Table.Td>{interview.candidateName}</Table.Td>
                <Table.Td>{interview.jobTitle}</Table.Td>
                <Table.Td>{interview.interviewerEmail}</Table.Td>
                <Table.Td>
                  {dayjs(interview.scheduledAt).format('MMM D, YYYY h:mm A')}
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={
                      interview.status === 'scheduled'
                        ? 'green'
                        : interview.status === 'cancelled'
                          ? 'red'
                          : 'blue'
                    }
                  >
                    {interview.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        setRescheduleTarget(interview)
                        setScheduledAt('')
                      }}
                    >
                      Reschedule
                    </Button>
                    {interview.status === 'scheduled' && (
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => setCancelTarget(interview)}
                      >
                        Cancel
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={rescheduleTarget !== null}
        onClose={() => setRescheduleTarget(null)}
        title={`Reschedule ${rescheduleTarget?.candidateName ?? ''}`}
      >
        <Stack>
          <TextInput
            label="New time"
            type="datetime-local"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRescheduleTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!scheduledAt}
              loading={reschedule.isPending}
              onClick={() => {
                if (rescheduleTarget && scheduledAt) {
                  reschedule.mutate(
                    {
                      id: rescheduleTarget.id,
                      body: { scheduledAt: new Date(scheduledAt).toISOString() },
                    },
                    { onSuccess: () => setRescheduleTarget(null) },
                  )
                }
              }}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancel interview"
      >
        <Stack>
          <Alert color="red">
            Cancel the interview for <b>{cancelTarget?.candidateName}</b> (
            {cancelTarget?.jobTitle})?
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setCancelTarget(null)}>
              Back
            </Button>
            <Button
              color="red"
              loading={reschedule.isPending}
              onClick={() => {
                if (cancelTarget) {
                  reschedule.mutate(
                    { id: cancelTarget.id, body: { status: 'cancelled' } },
                    { onSuccess: () => setCancelTarget(null) },
                  )
                }
              }}
            >
              Cancel interview
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
