import type { ReactNode } from 'react';
import { Paper, Title } from '@mantine/core';
import classes from './Authentication.module.css';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
}

export function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <div className={classes.wrapper}>
      <Paper className={classes.form} radius={0}>
        <Title order={2} className={classes.title}>
          {title}
        </Title>
        {children}
      </Paper>
    </div>
  );
}
