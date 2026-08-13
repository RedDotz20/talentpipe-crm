import { useEffect, useRef } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { NavigationProgress, nprogress } from '@mantine/nprogress';
import { router } from './router';

export function RouteProgress() {
  const isFetching = useIsFetching();
  const fetchingRef = useRef(0);
  const pendingRef = useRef(false);

  useEffect(() => {
    const unsubscribes = [
      router.subscribe('onBeforeNavigate', () => {
        pendingRef.current = true;
        nprogress.start();
      }),
      router.subscribe('onResolved', () => {
        if (fetchingRef.current === 0) {
          pendingRef.current = false;
          nprogress.complete();
        }
      }),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    fetchingRef.current = isFetching;
    if (isFetching > 0) {
      pendingRef.current = true;
      nprogress.start();
    } else if (pendingRef.current) {
      pendingRef.current = false;
      nprogress.complete();
    }
  }, [isFetching]);

  return <NavigationProgress />;
}
