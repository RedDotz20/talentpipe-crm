import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  SimpleGrid,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import {
  useDeleteCompany,
  usePlatformCompanies,
  usePlatformStats,
  useSetCompanyStatus,
} from './hooks/usePlatform'
import type { PlatformCompany } from '@/api/platformApi'

const PAGE_SIZE = 10

export function CompaniesPage() {
  const companiesQuery = usePlatformCompanies()
  const statsQuery = usePlatformStats()
  const setStatus = useSetCompanyStatus()
  const deleteCompany = useDeleteCompany()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<PlatformCompany | null>(null)

  const companies = companiesQuery.data ?? []

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return companies.filter((company) => {
      if (statusFilter && company.status !== statusFilter) return false
      if (
        term &&
        !company.name.toLowerCase().includes(term) &&
        !company.slug.toLowerCase().includes(term)
      ) {
        return false
      }
      return true
    })
  }, [companies, search, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Platform</Title>
      </Group>

      {statsQuery.isLoading ? (
        <Loader />
      ) : (
        <SimpleGrid cols={3} mb="lg">
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Companies
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.companies ?? 0}
            </Text>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Users
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.users ?? 0}
            </Text>
          </Card>
          <Card withBorder>
            <Text size="sm" c="dimmed">
              Applications
            </Text>
            <Text fw={700} size="xl">
              {statsQuery.data?.applications ?? 0}
            </Text>
          </Card>
        </SimpleGrid>
      )}

      <Group mb="md">
        <TextInput
          placeholder="Search name or slug"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            setPage(1)
          }}
        />
        <Select
          placeholder="Status"
          clearable
          data={[
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value)
            setPage(1)
          }}
        />
      </Group>

      {companiesQuery.isLoading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <Text c="dimmed">No companies match.</Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Company</Table.Th>
                <Table.Th>Slug</Table.Th>
                <Table.Th>Plan</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((company) => (
                <Table.Tr key={company.id}>
                  <Table.Td>
                    <Link
                      to="/admin/companies/$companyId"
                      params={{ companyId: company.id }}
                    >
                      {company.name}
                    </Link>
                  </Table.Td>
                  <Table.Td>{company.slug}</Table.Td>
                  <Table.Td>{company.plan}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={company.status === 'suspended' ? 'red' : 'green'}
                    >
                      {company.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{dayjs(company.createdAt).format('MMM D, YYYY')}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color={company.status === 'suspended' ? 'green' : 'yellow'}
                        loading={setStatus.isPending}
                        onClick={() =>
                          setStatus.mutate({
                            id: company.id,
                            status:
                              company.status === 'suspended' ? 'active' : 'suspended',
                          })
                        }
                      >
                        {company.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => setDeleting(company)}
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
            <Pagination
              total={pageCount}
              value={page}
              onChange={setPage}
              size="sm"
            />
          </Group>
        </>
      )}

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete company"
      >
        <Text>
          Delete <b>{deleting?.name}</b>? This permanently removes all of its
          users, data, and schema, and marks applications made by candidates to
          this company as cancelled. This cannot be undone.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteCompany.isPending}
            onClick={() => {
              if (deleting) {
                deleteCompany.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                })
              }
            }}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  )
}
