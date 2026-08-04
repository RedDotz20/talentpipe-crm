import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/api/dashboardApi';
import { queryKeys } from '@/api/queryKeys';

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.org.dashboardSummary(),
    queryFn: dashboardApi.getSummary,
  });
}
