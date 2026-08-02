import { Group, Text, rem } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconUpload } from '@tabler/icons-react';
import { useUploadResume } from './hooks/useResume';

const ACCEPT = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function ResumeUploadInput({ candidateId }: { candidateId: string }) {
  const upload = useUploadResume(candidateId);

  return (
    <Dropzone
      onDrop={(files) => {
        const file = files[0];
        if (file) upload.mutate(file);
      }}
      accept={ACCEPT}
      maxSize={10 * 1024 * 1024}
      loading={upload.isPending}
    >
      <Group justify="center" gap="xl" style={{ pointerEvents: 'none' }}>
        <IconUpload style={{ width: rem(40), height: rem(40) }} stroke={1.5} />
        <div>
          <Text size="sm">Drop a resume (PDF or DOCX, max 10MB)</Text>
          <Text size="xs" c="dimmed">
            Text is extracted and matched against required job skills.
          </Text>
        </div>
      </Group>
    </Dropzone>
  );
}
