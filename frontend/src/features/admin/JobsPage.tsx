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
import { ListControls } from '@/shared/components/ListControls'
import { useListQuery } from '@/shared/hooks/useListQuery'
import {
  useCloseJob,
  useCreateJob,
  useDeleteJob,
  usePlatformCompanies,
  usePlatformJobs,
  usePublishJob,
  useUpdateJob,
} from './hooks/usePlatform'

const statusColors: Record<string, string> = {
  draft: 'gray',
  open: 'green',
  closed: 'red',
}

const schema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  employmentType: z.string().min(1, 'Employment type is required'),
  location: z.string().min(1, 'Location is required'),
  workSetup: z.string().min(1, 'Work setup is required'),
  requiredSkillIds: z.array(z.string()).default([]),
})

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'intern']
const WORK_SETUPS = ['on-site', 'hybrid', 'work-from-home']

const metaLabel = (value: string | null | undefined): string => {
  if (!value) return 'Not specified'
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function JobsPage() {
  const listQuery = useListQuery({ sortBy: 'createdAt', sortDir: 'desc' })
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const jobsQuery = usePlatformJobs({
    ...listQuery.params,
    companyId: companyFilter ?? undefined,
    status: statusFilter ?? undefined,
  })
  const companiesQuery = usePlatformCompanies()
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

  const jobs = jobsQuery.data?.data ?? []
  const total = jobsQuery.data?.total ?? 0
  const companies = companiesQuery.data?.data ?? []

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
      employmentType: '',
      location: '',
      workSetup: '',
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
        employmentType: editing.employmentType ?? '',
        location: editing.location ?? '',
        workSetup: editing.workSetup ?? '',
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
            employmentType: values.employmentType,
            location: values.location,
            workSetup: values.workSetup,
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
          employmentType: values.employmentType,
          location: values.location,
          workSetup: values.workSetup,
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

      <ListControls
        searchPlaceholder="Search title or company"
        searchValue={listQuery.search}
        onSearchChange={(value) => {
          listQuery.setSearch(value)
          listQuery.setPage(1)
        }}
        filters={[
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
            key: 'status',
            placeholder: 'Status',
            data: [
              { value: 'draft', label: 'Draft' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
            ],
            value: statusFilter,
            onChange: (value) => {
              setStatusFilter(value)
              listQuery.setPage(1)
            },
          },
        ]}
        sortOptions={[
          { value: 'createdAt', label: 'Date created' },
          { value: 'title', label: 'Title' },
          { value: 'companyName', label: 'Company' },
        ]}
        sortBy={listQuery.sortBy}
        onSortByChange={(value) => {
          listQuery.setSortBy(value)
          listQuery.setPage(1)
        }}
        sortDir={listQuery.sortDir}
        onToggleSortDir={listQuery.toggleSortDir}
      />

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
                <Table.Th>Details</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {jobs.map((job) => (
                <Table.Tr key={job.id}>
                  <Table.Td>{job.companyName}</Table.Td>
                  <Table.Td>{job.title}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {metaLabel(job.employmentType)} · {metaLabel(job.location)} ·{' '}
                      {metaLabel(job.workSetup)}
                    </Text>
                  </Table.Td>
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
            <Pagination total={Math.max(1, Math.ceil(total / 10))} value={listQuery.page} onChange={listQuery.setPage} size="sm" />
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
            <Select
              label="Employment type"
              placeholder="Full-time"
              required
              data={EMPLOYMENT_TYPES.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              }))}
              {...form.getInputProps('employmentType')}
            />
            <TextInput
              label="Location"
              placeholder="Makati City"
              required
              {...form.getInputProps('location')}
            />
            <Select
              label="Work setup"
              placeholder="On-site"
              required
              data={WORK_SETUPS.map((value) => ({
                value,
                label: value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              }))}
              {...form.getInputProps('workSetup')}
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
