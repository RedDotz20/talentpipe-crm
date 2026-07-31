import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { isAxiosError } from 'axios';

export interface ApiEnvelope<T> {
  data: T;
  message: string;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

export type UseApiMutationOptions<TData, TVariables, TContext> = Omit<
  UseMutationOptions<ApiEnvelope<TData>, unknown, TVariables, TContext>,
  'mutationFn' | 'onSuccess' | 'onError'
> & {
  mutationFn: (variables: TVariables) => Promise<ApiEnvelope<TData>>;
  successMessage?: string;
  errorMessage?: string;
  silent?: boolean;
  onSuccess?: UseMutationOptions<
    ApiEnvelope<TData>,
    unknown,
    TVariables,
    TContext
  >['onSuccess'];
  onError?: UseMutationOptions<
    ApiEnvelope<TData>,
    unknown,
    TVariables,
    TContext
  >['onError'];
};

export function useApiMutation<
  TData extends unknown,
  TVariables = void,
  TContext = unknown,
>(
  options: UseApiMutationOptions<TData, TVariables, TContext>,
) {
  const {
    mutationFn,
    successMessage,
    errorMessage,
    silent,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<ApiEnvelope<TData>, unknown, TVariables, TContext>({
    ...rest,
    mutationFn,
    onSuccess: (data, vars, onMutateResult, ctx) => {
      if (!silent) {
        notifications.show({
          color: 'green',
          title: 'Success',
          message: successMessage ?? data.message ?? 'Done',
        });
      }
      onSuccess?.(data, vars, onMutateResult, ctx);
    },
    onError: (err, vars, onMutateResult, ctx) => {
      const status = isAxiosError<ApiErrorBody>(err)
        ? err.response?.status
        : undefined;
      if (status !== 401 && !silent) {
        const backendMessage = isAxiosError<ApiErrorBody>(err)
          ? err.response?.data?.error?.message
          : undefined;
        notifications.show({
          color: 'red',
          title: 'Error',
          message: errorMessage ?? backendMessage ?? 'Something went wrong',
        });
      }
      onError?.(err, vars, onMutateResult, ctx);
    },
  });
}