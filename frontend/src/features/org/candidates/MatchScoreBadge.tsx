import { Badge } from '@mantine/core';

function matchColor(score: number | null): string {
  if (score === null) return 'gray';
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'yellow';
  return 'red';
}

export function MatchScoreBadge({ score }: { score: number | null }) {
  const label = score === null ? '—' : `${Math.round(score * 100)}%`;
  return (
    <Badge size="xs" color={matchColor(score)} variant="light">
      {label}
    </Badge>
  );
}
