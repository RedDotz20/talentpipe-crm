import { useAuthStore } from '@/api/useAuth';

export function usePermission(...keys: string[]): boolean {
  const permissions = useAuthStore((s) => s.permissions);
  if (keys.length === 0) return true;
  return keys.some((key) => permissions.includes(key));
}
