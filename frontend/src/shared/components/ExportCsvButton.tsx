import { useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

interface ExportCsvButtonProps {
  resource: string;
  request: () => Promise<Blob>;
}

export function ExportCsvButton({ resource, request }: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    setError(false);
    try {
      const blob = await request();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Group gap="xs">
      <Button
        variant="light"
        size="xs"
        loading={loading}
        leftSection={<IconDownload size="1rem" />}
        onClick={handleClick}
      >
        Export
      </Button>
      {error && (
        <Text size="xs" c="red">
          Export failed
        </Text>
      )}
    </Group>
  );
}
