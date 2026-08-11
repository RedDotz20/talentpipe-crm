import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm, schemaResolver } from '@mantine/form'
import { z } from 'zod'
import dayjs from 'dayjs'
import type { PlatformJob } from '@/api/platformApi'
import { platformApi } from '@/api/platformApi'
import { RequiredSkillsPicker } from '@/features/company/job-postings/RequiredSkillsPicker'
import {
  useCloseJob,
  useCreateJob,
  useDeleteJob,
  usePlatformCompanies,
  usePlatformJobs,
  usePublishJob,
  useUpdateJob,
} from './hooks/usePlatform'

const PAGE_SIZE = 10

const statusColors: Record<string, string> = {
  draft: 'gray',
  open: 'green',
  closed: 'red',
}

const schema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  requiredSkillIds: z.array(z.string()).default([]),
})

export function JobsPage() {
  const [filters, setFilters] = useState<{ companyId?: string; status?: string }>(
    {},
  )
  const jobsQuery = usePlatformJobs(filters)
  const companiesQuery = usePlatformCompanies()
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PlatformJob | null>(null)
  const [detail, setDetail] = useState<{ requiredSkillIds: string[] } | null>(
    null,
  )
  const [deleting, setDeleting] = useState<PlatformJob | null>(null)

  const create = useCreateJob()
  const update = useUpdateJob()
  const publish = usePublishJob()
  const close = useCloseJob()
  const remove = useDeleteJob()

  const jobs = jobsQuery.data ?? []
  const companies = companiesQuery.data ?? []

  const pageCount = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE))
  const rows = jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [filters])

  useEffect(() => {
    if (editing) {
      setDetail(null)
      platformApi.getJob(editing.id).then((job) => setDetail(job))
    }
  }, [editing])

  const form = useForm({
    initialValues: {
      companyId: '',
      title: '',
      description: '',
      requiredSkillIds: [] as string[],
    },
    validate: schemaResolver(schema),
  })

  useEffect(() => {
    if (formOpen && editing) {
      form.setValues({
        companyId: editing.companyId,
        title: editing.title,
        description: editing.description ?? '',
        requiredSkillIds: detail?.requiredSkillIds ?? [],
      })
    } else if (formOpen && !editing) {
      form.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, editing, detail])

  const submit = () => {
    const values = form.values
    if (editing) {
      update.mutate(
        {
          id: editing.id,
          input: {
            title: values.title,
            description: values.description || null,
            requiredSkillIds: values.requiredSkillIds,
          },
        },
        { onSuccess: () => closeForm() },
      )
    } else {
      create.mutate(
        {
          companyId: values.companyId,
          title: values.title,
          description: values.description || undefined,
          requiredSkillIds: values.requiredSkillIds,
        },
        { onSuccess: () => closeForm() },
      )
    }
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setDetail(null)
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Jobs</Title>
        <Button onClick={() => setFormOpen(true)}>New job</Button>
      </Group>

      <Group mb="md">
        <Select
          placeholder="Company"
          clearable
          searchable
          data={companies.map((c) => ({ value: c.id, label: c.name }))}
          value={filters.companyId ?? null}
          onChange={(value) =>
            setFilters((f) => ({ ...f, companyId: value ?? undefined }))
          }
        />
        <Select
          placeholder="Status"
          clearable
          data={[
            { value: 'draft', label: 'Draft' },
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
          value={filters.status ?? null}
          onChange={(value) =>
            setFilters((f) => ({ ...f, status: value ?? undefined }))
          }
        />
      </Group>

      {jobsQuery.isLoading ? (
        <Loader />
      ) : jobs.length === 0 ? (
        <Text c="dimmed">No jobs match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Company</Table.Th>
                <Table.Th>Title</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((job) => (
                <Table.Tr key={job.id}>
                  <Table.Td>{job.companyName}</Table.Td>
                  <Table.Td>{job.title}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={statusColors[job.status]}>
                      {job.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{dayjs(job.createdAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                          setEditing(job)
                          setFormOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      {job.status === 'draft' && (
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          loading={publish.isPending}
                          onClick={() => publish.mutate(job.id)}
                        >
                          Publish
                        </Button>
                      )}
                      {job.status === 'open' && (
                        <Button
                          size="xs"
                          variant="light"
                          color="yellow"
                          loading={close.isPending}
                          onClick={() => close.mutate(job.id)}
                        >
                          Close
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => setDeleting(job)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Pagination total={pageCount} value={page} onChange={setPage} size="sm" />
          </Group>
        </>
      )}

      <Modal
        opened={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit job' : 'New job'}
      >
        <form onSubmit={form.onSubmit(submit)}>
          <Stack>
            {!editing && (
              <Select
                label="Company"
                placeholder="Select company"
                required
                searchable
                data={companies.map((c) => ({ value: c.id, label: c.name }))}
                {...form.getInputProps('companyId')}
              />
            )}
            <TextInput
              label="Title"
              placeholder="Senior Software Engineer"
              required
              {...form.getInputProps('title')}
            />
            <Textarea
              label="Description"
              autosize
              minRows={3}
              {...form.getInputProps('description')}
            />
            <RequiredSkillsPicker
              value={form.values.requiredSkillIds}
              onChange={(v) => form.setFieldValue('requiredSkillIds', v)}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={closeForm}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={create.isPending || update.isPending}
              >
                {editing ? 'Save' : 'Create'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete job"
      >
        <Stack>
          <Text>
            Delete <b>{deleting?.title}</b>? Only closed jobs without
            applications can be deleted. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() => {
                if (deleting) {
                  remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
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
