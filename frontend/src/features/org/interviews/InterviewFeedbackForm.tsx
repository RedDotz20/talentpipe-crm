import { useEffect, useState } from 'react';
import { Button, Group, Modal, Rating, Stack, Text, Textarea } from '@mantine/core';
import type { Interview } from '@/api/interviewsApi';
import { useSubmitFeedback } from './hooks/useInterviews';

export function InterviewFeedbackForm({
  interview,
  onClose,
}: {
  interview: Interview | null;
  onClose: () => void;
}) {
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (!interview) return;
    setRating(0);
    setComments('');
  }, [interview]);

  return (
    <Modal
      opened={!!interview}
      onClose={onClose}
      title={interview ? `Feedback — ${interview.candidateName}` : ''}
      centered
    >
      <Stack>
        <Text size="sm" fw={500}>
          Rating
        </Text>
        <Rating value={rating} onChange={setRating} size="lg" count={5} />
        <Textarea
          label="Comments"
          placeholder="How did the interview go?"
          value={comments}
          onChange={(e) => setComments(e.currentTarget.value)}
          minRows={3}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={rating === 0 || submit.isPending}
            loading={submit.isPending}
            onClick={() => {
              if (!interview) return;
              submit.mutate(
                {
                  id: interview.id,
                  rating,
                  comments: comments.trim() || undefined,
                },
                { onSuccess: onClose },
              );
            }}
          >
            Submit feedback
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
