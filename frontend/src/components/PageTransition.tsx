import type { ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';

export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
