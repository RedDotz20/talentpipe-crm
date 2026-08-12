import type { ReactNode } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';

interface TableActionProps {
  label: string;
  color?: string;
  variant?: 'light' | 'outline' | 'subtle' | 'filled';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function TableAction({
  label,
  color,
  variant = 'light',
  loading,
  disabled,
  onClick,
  children,
}: TableActionProps) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant={variant}
        color={color}
        loading={loading}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}
