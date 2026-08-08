import { useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi, type Application } from '@/api/applicationsApi';
import { pipelineStagesApi, type PipelineStage } from '@/api/pipelineStagesApi';
import { queryKeys } from '@/api/queryKeys';
import { useApiMutation, type ApiEnvelope } from '@/hooks/useApiMutation';

export interface ApplicationFiltersInput {
  jobPostingId?: string;
  stageId?: string;
}

export function useApplications(filters?: ApplicationFiltersInput) {
  return useQuery({
    queryKey: queryKeys.company.applications(filters),
    queryFn: () => applicationsApi.list(filters),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: queryKeys.company.application(id),
    queryFn: () => applicationsApi.get(id),
    enabled: !!id,
  });
}

export function useUpdateStage() {
  const queryClient = useQueryClient();
  const key = queryKeys.company.applications();
  return useApiMutation<
    Application,
    { applicationId: string; stageId: string },
    { previous?: Application[] }
  >({
    mutationFn: ({ applicationId, stageId }) =>
      applicationsApi.updateStage(applicationId, stageId),
    silent: true,
    onMutate: async ({ applicationId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Application[]>(key);
      const stages = queryClient.getQueryData<PipelineStage[]>(
        queryKeys.company.pipelineStages(),
      );
      const stageName = stages?.find((s) => s.id === stageId)?.name;
      if (previous) {
        queryClient.setQueryData<Application[]>(
          key,
          previous.map((app) =>
            app.id === applicationId
              ? {
                  ...app,
                  currentStageId: stageId,
                  ...(stageName ? { stageName } : {}),
                }
              : app,
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useNotes(applicationId: string) {
  return useQuery({
    queryKey: queryKeys.company.notes(applicationId),
    queryFn: () => applicationsApi.listNotes(applicationId),
    enabled: !!applicationId,
  });
}

export function useAddNote(applicationId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (content: string) =>
      applicationsApi.createNote(applicationId, content),
    successMessage: 'Note added',
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.notes(applicationId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.company.application(applicationId),
      });
    },
  });
}

export function usePipelineStages() {
  return useQuery({
    queryKey: queryKeys.company.pipelineStages(),
    queryFn: () => pipelineStagesApi.list(),
  });
}

export function useCreateStage() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (name: string) => pipelineStagesApi.create(name),
    successMessage: 'Stage created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}

export function useUpdateStageConfig() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; order?: number };
    }) => pipelineStagesApi.update(id, input),
    successMessage: 'Stage updated',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}

export function useDeleteStage() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: pipelineStagesApi.remove,
    successMessage: 'Stage deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}

export function useReorderStages() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: async (stages: { id: string; order: number }[]) => {
      let last: ApiEnvelope<PipelineStage> | undefined;
      for (const { id, order } of stages) {
        last = await pipelineStagesApi.update(id, { order });
      }
      return last as ApiEnvelope<PipelineStage>;
    },
    silent: true,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company.pipelineStages() });
    },
  });
}
