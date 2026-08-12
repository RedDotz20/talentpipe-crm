import { useState } from 'react'
import {
  Badge,
  Button,
  Group,
  Modal,
  Pagination,
  Select,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { PlatformApplication } from '@/api/platformApi'
import { ListControls } from '@/shared/components/ListControls'
import { TableSkeleton } from '@/shared/components/Skeletons'
import { useListQuery } from '@/shared/hooks/useListQuery'
import {
  useMoveApplicationStage,
  usePlatformApplications,
  usePlatformCompanies,
  usePlatformStages,
} from './hooks/usePlatform'

export function ApplicationsPage() {
  const listQuery = useListQuery({ sortBy: 'appliedAt', sortDir: 'desc' })
  const [companyFilter, setCompanyFilter] = useState<string | null>(null)
  const applicationsQuery = usePlatformApplications({
    ...listQuery.params,
    companyId: companyFilter ?? undefined,
  })
  const companiesQuery = usePlatformCompanies()

  const [moveTarget, setMoveTarget] = useState<PlatformApplication | null>(null)
  const [stageId, setStageId] = useState<string | null>(null)

  const moveStage = useMoveApplicationStage()
  const stagesQuery = usePlatformStages(moveTarget?.companyId ?? '')

  const applications = applicationsQuery.data?.data ?? []
  const total = applicationsQuery.data?.total ?? 0
  const companies = companiesQuery.data?.data ?? []

  const openMove = (app: PlatformApplication) => {
    setMoveTarget(app)
    setStageId(null)
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Applications</Title>
      </Group>

      <ListControls
        searchPlaceholder="Search candidate, job, or company"
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
        ]}
        sortOptions={[
          { value: 'appliedAt', label: 'Applied date' },
          { value: 'jobTitle', label: 'Job title' },
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

      {applicationsQuery.isLoading ? (
        <TableSkeleton
          headers={['Candidate', 'Company', 'Job', 'Stage', 'Applied', 'Match', 'Actions']}
        />
      ) : applications.length === 0 ? (
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
              {applications.map((app) => (
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
            <Pagination total={Math.max(1, Math.ceil(total / 10))} value={listQuery.page} onChange={listQuery.setPage} size="sm" />
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
