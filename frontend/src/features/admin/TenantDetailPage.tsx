import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { useSetTenantStatus, useTenantDetail } from './hooks/usePlatform';

export function TenantDetailPage({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const { data: tenant, isLoading, error } = useTenantDetail(tenantId);
  const setStatus = useSetTenantStatus();

  if (isLoading) return <Loader />;
  if (error || !tenant) {
    return <Alert color="red">Tenant not found.</Alert>;
  }

  const isSuspended = tenant.status === 'suspended';

  const handleToggle = () => {
    setStatus.mutate(
      { id: tenant.id, status: isSuspended ? 'active' : 'suspended' },
      { onSuccess: () => navigate({ to: '/admin/tenants' }) },
    );
  };

  return (
    <Stack maw={560}>
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
    </Stack>
  );
}
