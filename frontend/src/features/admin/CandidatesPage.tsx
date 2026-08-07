import { useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import dayjs from 'dayjs'
import type { PlatformCandidate } from '@/api/platformApi'
import {
  useCreateCandidate,
  usePlatformCandidates,
  useRemoveCandidate,
  useUpdateCandidate,
} from './hooks/usePlatform'

interface CandidateForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

const emptyForm: CandidateForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
}

export function CandidatesPage() {
  const candidatesQuery = usePlatformCandidates()
  const createCandidate = useCreateCandidate()
  const updateCandidate = useUpdateCandidate()
  const removeCandidate = useRemoveCandidate()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<PlatformCandidate | null>(null)
  const [removing, setRemoving] = useState<PlatformCandidate | null>(null)
  const [form, setForm] = useState<CandidateForm>(emptyForm)

  const candidates = candidatesQuery.data ?? []

  const setField = (key: keyof CandidateForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const openEdit = (candidate: PlatformCandidate) => {
    setEditing(candidate)
    setForm({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone ?? '',
      password: '',
    })
  }

  const submitCreate = () => {
    createCandidate.mutate(
      {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
      },
      {
        onSuccess: () => {
          setCreateOpen(false)
          setForm(emptyForm)
        },
      },
    )
  }

  const submitUpdate = () => {
    if (!editing) return
    updateCandidate.mutate(
      {
        id: editing.id,
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || null,
          password: form.password || undefined,
        },
      },
      { onSuccess: () => setEditing(null) },
    )
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Candidates</Title>
        <Button onClick={() => setCreateOpen(true)}>Add candidate</Button>
      </Group>

      {candidatesQuery.isLoading ? (
        <Loader />
      ) : candidates.length === 0 ? (
        <Text c="dimmed">No candidate accounts yet.</Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Phone</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {candidates.map((candidate) => (
              <Table.Tr key={candidate.id}>
                <Table.Td>
                  {candidate.firstName} {candidate.lastName}
                </Table.Td>
                <Table.Td>{candidate.email}</Table.Td>
                <Table.Td>{candidate.phone ?? '—'}</Table.Td>
                <Table.Td>{dayjs(candidate.createdAt).format('MMM D, YYYY')}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openEdit(candidate)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => setRemoving(candidate)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Add candidate">
        <Stack>
          <TextInput
            label="First name"
            required
            value={form.firstName}
            onChange={(e) => setField('firstName', e.currentTarget.value)}
          />
          <TextInput
            label="Last name"
            required
            value={form.lastName}
            onChange={(e) => setField('lastName', e.currentTarget.value)}
          />
          <TextInput
            label="Email"
            required
            value={form.email}
            onChange={(e) => setField('email', e.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            value={form.phone}
            onChange={(e) => setField('phone', e.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            description="No email is sent — share the password out-of-band."
            required
            value={form.password}
            onChange={(e) => setField('password', e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              loading={createCandidate.isPending}
              disabled={
                !form.firstName ||
                !form.lastName ||
                !form.email.includes('@') ||
                form.password.length < 8
              }
              onClick={submitCreate}
            >
              Add
            </Button>
          </Group>
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
            value={form.firstName}
            onChange={(e) => setField('firstName', e.currentTarget.value)}
          />
          <TextInput
            label="Last name"
            required
            value={form.lastName}
            onChange={(e) => setField('lastName', e.currentTarget.value)}
          />
          <TextInput
            label="Phone"
            value={form.phone}
            onChange={(e) => setField('phone', e.currentTarget.value)}
          />
          <PasswordInput
            label="Password"
            description="Leave blank to keep the current password."
            value={form.password}
            onChange={(e) => setField('password', e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={updateCandidate.isPending}
              disabled={!form.firstName || !form.lastName}
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
        title="Delete candidate"
      >
        <Stack>
          <Alert color="red">
            Delete <b>{removing?.email}</b>? Their applications and profile will be
            removed.
          </Alert>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={removeCandidate.isPending}
              onClick={() => {
                if (removing) {
                  removeCandidate.mutate(removing.id, {
                    onSuccess: () => setRemoving(null),
                  })
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
