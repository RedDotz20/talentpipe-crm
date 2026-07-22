import type { ReactNode } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useAuthStore } from '../api/useAuth';

interface Props {
  allowedRoles: string[];
  children: ReactNode;
}

export function RoleGuard({ allowedRoles, children }: Props) {
  const role = useAuthStore((s) => s.role);
  const isAuth = useAuthStore((s) => s.isAuthenticated());

  if (!isAuth) return <Navigate to="/login" />;
  if (!allowedRoles.includes(role!)) return <div>403 - Forbidden</div>;
  return <>{children}</>;
}
