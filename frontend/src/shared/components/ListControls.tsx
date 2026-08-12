import type { ReactNode } from 'react';
import { ActionIcon, Group, Select, TextInput } from '@mantine/core';
import {
  IconSortAscending,
  IconSortDescending,
  IconSearch,
} from '@tabler/icons-react';

export interface ListControlFilter {
  key: string;
  placeholder: string;
  searchable?: boolean;
  data: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}

interface ListControlsProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: ListControlFilter[];
  sortOptions: { value: string; label: string }[];
  sortBy: string | null;
  onSortByChange: (value: string | null) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
  actions?: ReactNode;
}

export function ListControls({
  searchPlaceholder = 'Search…',
  searchValue,
  onSearchChange,
  filters = [],
  sortOptions,
  sortBy,
  onSortByChange,
  sortDir,
  onToggleSortDir,
  actions,
}: ListControlsProps) {
  return (
    <Group mb="md" wrap="wrap">
      <TextInput
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
        leftSection={<IconSearch size="1rem" />}
        style={{ minWidth: 200 }}
      />
      {filters.map((filter) => (
        <Select
          key={filter.key}
          placeholder={filter.placeholder}
          clearable
          searchable={filter.searchable}
          data={filter.data}
          value={filter.value}
          onChange={filter.onChange}
        />
      ))}
      <Select
        placeholder="Sort by"
        clearable
        data={sortOptions}
        value={sortBy}
        onChange={onSortByChange}
      />
      <ActionIcon
        variant="light"
        onClick={onToggleSortDir}
        aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
      >
        {sortDir === 'asc' ? (
          <IconSortAscending size="1rem" />
        ) : (
          <IconSortDescending size="1rem" />
        )}
      </ActionIcon>
      {actions}
    </Group>
  );
}
