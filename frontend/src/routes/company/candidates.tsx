import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { CandidateList } from '@/features/company/candidates/CandidateList';
import { CandidateProfile } from '@/features/company/candidates/CandidateProfile';

export const Route = createFileRoute('/company/candidates')({
  component: CandidatesPage,
});

function CandidatesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <CandidateList onSelect={setSelectedId} />
      <CandidateProfile
        candidateId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
