import type { ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useReducedMotion } from '@mantine/hooks';

export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();
  return (
    <div key={pathname} className={reduceMotion ? undefined : 'page-enter'}>
      {children}
    </div>
  );
}
