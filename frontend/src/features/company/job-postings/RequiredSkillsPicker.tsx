import { useEffect, useState } from 'react';
import { MultiSelect } from '@mantine/core';
import { useSearchSkills } from './hooks/useSkills';

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

export function RequiredSkillsPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data } = useSearchSkills(debounced);

  return (
    <MultiSelect
      label="Required skills"
      placeholder="Search and select skills"
      data={(data ?? []).map((s) => ({ value: s.id, label: s.name }))}
      value={value}
      onChange={onChange}
      onSearchChange={setSearch}
      searchable
      clearable
    />
  );
}
