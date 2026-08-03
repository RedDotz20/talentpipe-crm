import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Stack, MultiSelect, Text, Title, Button, Group, Loader, Alert } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { useCandidateSkills, useSetCandidateSkills, useAllSkills } from '@/features/candidate-portal/hooks';
import type { Skill } from '@/features/candidate-portal/types';

export const Route = createFileRoute('/_candidate/skills')({
  component: SkillsPage,
});

function SkillsPage() {
  const navigate = useNavigate();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: candidateSkills = [], isLoading: loadingCandidateSkills } = useCandidateSkills();
  const { data: allSkills = [], isLoading: loadingAllSkills } = useAllSkills();
  const setSkillsMutation = useSetCandidateSkills();

  const candidateSkillIds = new Set(candidateSkills.map((s: Skill) => s.id));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setSkillsMutation.mutateAsync(selectedSkills);
      navigate({ to: '/dashboard' });
    } catch (error) {
      console.error('Failed to save skills:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (value: string[]) => {
    setSelectedSkills(value);
  };

  if (loadingCandidateSkills || loadingAllSkills) {
    return (
      <Stack gap="md">
        <Title order={2}>My Skills</Title>
        <Loader size="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title order={2}>My Skills</Title>
        <Text size="sm" c="dimmed">
          Select the skills that best represent your expertise. These will be used to match you with relevant job opportunities.
        </Text>
      </Stack>

      <Stack gap="md">
        <MultiSelect
          label="Select Skills"
          placeholder="Search and select your skills..."
          searchable
          clearable
          data={allSkills.map((skill: Skill) => ({
            value: skill.id,
            label: skill.name,
            description: skill.category || undefined,
          }))}
          value={selectedSkills}
          onChange={handleChange}
          defaultValue={Array.from(candidateSkillIds)}
          w={600}
        />

        {setSkillsMutation.isError && (
          <Alert color="red" title="Error" withCloseButton>
            Failed to save skills. Please try again.
          </Alert>
        )}

        <Group justify="flex-end" gap="md">
          <Button
            variant="subtle"
            onClick={() => navigate({ to: '/dashboard' })}
            disabled={isSaving || setSkillsMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || setSkillsMutation.isPending}
            loading={isSaving || setSkillsMutation.isPending}
          >
            Save Skills
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}