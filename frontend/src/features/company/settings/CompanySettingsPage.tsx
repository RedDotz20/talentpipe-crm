import { Alert, Button, Card, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { z } from 'zod';
import { useCompanySettings, useUpdateCompanySettings } from './hooks/useCompanySettings';

const CompanySettingsSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
});

export function CompanySettingsPage() {
  const { data: settings, isLoading, error } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();

  const form = useForm({
    validate: schemaResolver(CompanySettingsSchema),
    values: { name: settings?.name ?? '' },
  });

  if (isLoading) return <Loader />;
  if (error || !settings) {
    return <Alert color="red">Company settings are unavailable.</Alert>;
  }

  return (
    <Stack maw={480}>
      <Title order={3}>Company settings</Title>
      <Card withBorder>
        <form onSubmit={form.onSubmit((values) => updateSettings.mutate(values))}>
          <Stack>
            <TextInput label="Company name" {...form.getInputProps('name')} />
            <Text size="sm" c="dimmed">
              Slug: {settings.slug} · Plan: {settings.plan} · Status:{' '}
              {settings.status}
            </Text>
            <Group justify="flex-end">
              <Button type="submit" loading={updateSettings.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
