import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { PlatformApplication } from '@/api/platformApi'
import {
  useMoveApplicationStage,
  usePlatformApplications,
  usePlatformCompanies,
  usePlatformStages,
} from './hooks/usePlatform'

const PAGE_SIZE = 10

export function ApplicationsPage() {
  const applicationsQuery = usePlatformApplications()
  const companiesQuery = usePlatformCompanies()

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [moveTarget, setMoveTarget] = useState<PlatformApplication | null>(null)
  const [stageId, setStageId] = useState<string | null>(null)

  const moveStage = useMoveApplicationStage()
  const stagesQuery = usePlatformStages(moveTarget?.companyId ?? '')

  const applications = applicationsQuery.data ?? []
  const companies = companiesQuery.data ?? []

  const stages = useMemo(() => {
    const names = new Set<string>()
    for (const app of applications) names.add(app.stageName)
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [applications])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return applications.filter((app) => {
      if (companyFilter && app.companyId !== companyFilter) return false
      if (stageFilter && app.stageName !== stageFilter) return false
      if (
        term &&
        !app.candidateName.toLowerCase().includes(term) &&
        !app.jobTitle.toLowerCase().includes(term) &&
        !app.companyName.toLowerCase().includes(term)
      ) {
        return false
      }
      return true
    })
  }, [applications, search, companyFilter, stageFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openMove = (app: PlatformApplication) => {
    setMoveTarget(app)
    setStageId(null)
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Applications</Title>
      </Group>

      <Group mb="md">
        <TextInput
          placeholder="Search candidate, job, or company"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Company"
          clearable
          searchable
          data={companies.map((c) => ({ value: c.id, label: c.name }))}
          value={companyFilter}
          onChange={(value) => {
            setCompanyFilter(value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Stage"
          clearable
          data={stages}
          value={stageFilter}
          onChange={(value) => {
            setStageFilter(value)
            setPage(1)
          }}
        />
      </Group>

      {applicationsQuery.isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <Text c="dimmed">No applications match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Candidate</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Stage</Table.Th>
                <Table.Th>Applied</Table.Th>
                <Table.Th>Match</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((app) => (
                <Table.Tr key={app.id}>
                  <Table.Td>{app.candidateName}</Table.Td>
                  <Table.Td>
                    <Link
                      to="/admin/companies/$companyId"
                      params={{ companyId: app.companyId }}
                    >
                      {app.companyName}
                    </Link>
                  </Table.Td>
                  <Table.Td>{app.jobTitle}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{app.stageName}</Badge>
                  </Table.Td>
                  <Table.Td>{dayjs(app.appliedAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    {app.matchScore !== null && app.matchScore !== undefined
                      ? `${Math.round(app.matchScore * 100)}%`
                      : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => openMove(app)}
                    >
                      Move stage
                    </Button>
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
        opened={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={`Move ${moveTarget?.candidateName ?? ''} — ${moveTarget?.jobTitle ?? ''}`}
      >
        <Select
          label="Stage"
          required
          data={(stagesQuery.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={stageId}
          onChange={setStageId}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={() => setMoveTarget(null)}>
            Cancel
          </Button>
          <Button
            disabled={!stageId}
            onClick={() => {
              if (moveTarget && stageId) {
                moveStage.mutate(
                  { id: moveTarget.id, stageId },
                  { onSuccess: () => setMoveTarget(null) },
                )
              }
            }}
          >
            Move
          </Button>
        </Group>
      </Modal>
    </>
  )
}
