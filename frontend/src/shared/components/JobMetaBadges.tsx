import { Badge, Group } from '@mantine/core';

interface JobMetaBadgesProps {
  employmentType?: string | null;
  location?: string | null;
  workSetup?: string | null;
}

const formatLabel = (value: string | null | undefined): string => {
  if (!value) return 'Not specified';
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export function JobMetaBadges({
  employmentType,
  location,
  workSetup,
}: JobMetaBadgesProps) {
  return (
    <Group gap="xs">
      <Badge variant="light" size="sm">
        {formatLabel(employmentType)}
      </Badge>
      <Badge variant="light" size="sm">
        {formatLabel(location)}
      </Badge>
      <Badge variant="light" size="sm">
        {formatLabel(workSetup)}
      </Badge>
    </Group>
  );
}
